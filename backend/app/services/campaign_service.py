import os
import asyncio
import logging
import requests
import datetime
from sqlalchemy.orm import Session
from ..models import Campaign, Communication, Event, Customer
from ..database import SessionLocal

logger = logging.getLogger(__name__)

CHANNEL_SERVICE_URL = os.getenv("CHANNEL_SERVICE_URL", "http://localhost:8001")
CRM_BACKEND_URL = os.getenv("CRM_BACKEND_URL", "http://localhost:8000")

async def send_single_communication(comm_id: int):
    """
    Sends a single communication to the Channel Service.
    Implements up to 3 attempts with 2-second sleep in case of connection issues.
    Uses its own database session to avoid concurrency issues with asyncio.gather.
    """
    db = SessionLocal()
    try:
        comm = db.query(Communication).filter(Communication.id == comm_id).first()
        if not comm:
            return

        payload = {
            "communication_id": comm.id,
            "customer_id": comm.customer_id,
            "message": comm.message,
            "channel": comm.channel,
            "callback_url": f"{CRM_BACKEND_URL.rstrip('/')}/api/receipts"
        }

        success = False
        max_retries = 3
        
        for attempt in range(1, max_retries + 1):
            comm.delivery_attempts = attempt
            db.commit()
            
            try:
                logger.info(f"Sending comm {comm.id} to Channel Service (attempt {attempt}/{max_retries})...")
                # Strip trailing slashes to prevent //send double slashes
                base_url = CHANNEL_SERVICE_URL.rstrip('/')
                
                # Run the blocking request in an executor to keep it async
                loop = asyncio.get_event_loop()
                response = await loop.run_in_executor(
                    None, 
                    lambda: requests.post(f"{base_url}/send", json=payload, timeout=15)
                )
                
                if response.status_code == 200:
                    success = True
                    logger.info(f"Successfully sent comm {comm.id} to Channel Service.")
                    break
                else:
                    logger.warning(f"Channel service returned status {response.status_code} for comm {comm.id}.")
            except Exception as e:
                logger.error(f"Error calling Channel Service for comm {comm.id} (attempt {attempt}): {e}")
                
            if attempt < max_retries:
                await asyncio.sleep(2.0)

        # Re-evaluate inside db session
        comm = db.query(Communication).filter(Communication.id == comm_id).first()
        if success:
            comm.status = "sent"
            comm.sent_at = datetime.datetime.utcnow()
            # Add sent event
            event = Event(
                communication_id=comm.id,
                event_type="sent",
                timestamp=datetime.datetime.utcnow()
            )
            db.add(event)
        else:
            comm.status = "failed"
            event = Event(
                communication_id=comm.id,
                event_type="failed",
                metadata_json={"error": "Failed to dispatch to Channel Service after 3 attempts"},
                timestamp=datetime.datetime.utcnow()
            )
            db.add(event)
            
        db.commit()
    except Exception as e:
        logger.error(f"Error in send_single_communication for comm {comm_id}: {e}")
    finally:
        db.close()

async def launch_campaign_task(campaign_id: int, customer_ids: list):
    """
    Launches a campaign by sending messages to all customers in the segment.
    Runs as a background task.
    """
    db = SessionLocal()
    try:
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not campaign:
            logger.error(f"Campaign {campaign_id} not found during launch.")
            return

        campaign.status = "running"
        db.commit()

        # Create communications for each customer
        comm_ids = []
        channels = [ch.strip() for ch in campaign.channel.split(',')]
        
        for cust_id in customer_ids:
            customer = db.query(Customer).filter(Customer.id == cust_id).first()
            if not customer:
                continue
            
            # Personalise message content
            personalized_msg = campaign.message.replace("[Name]", customer.name)
            
            for channel in channels:
                comm = Communication(
                    campaign_id=campaign.id,
                    customer_id=customer.id,
                    channel=channel,
                    message=personalized_msg,
                    status="pending"
                )
                db.add(comm)
                db.flush() # Populate comm.id
                comm_ids.append(comm.id)
            
        db.commit()

        logger.info(f"Created {len(comm_ids)} communications for campaign {campaign.name} (ID: {campaign.id})")

        # Send messages with controlled concurrency/batches to avoid overwhelming the network
        batch_size = 10
        for i in range(0, len(comm_ids), batch_size):
            batch = comm_ids[i:i+batch_size]
            tasks = [send_single_communication(cid) for cid in batch]
            await asyncio.gather(*tasks)
            # Short sleep between batches
            await asyncio.sleep(0.5)

        # Update campaign status once dispatches are complete
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        campaign.status = "completed"
        db.commit()
        logger.info(f"Campaign {campaign.name} launch processing completed.")

    except Exception as e:
        logger.error(f"Error in campaign launch background task: {e}")
    finally:
        db.close()
