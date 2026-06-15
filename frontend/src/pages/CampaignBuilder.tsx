import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Users, MessageSquare, Send, RefreshCw, AlertCircle, CheckCircle2, Mic, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useVoiceInput from '../hooks/useVoiceInput';

const stagger = {
  animate: { transition: { staggerChildren: 0.05 } },
};

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] as const } },
};

interface CampaignBuilderProps {
  setPage: (page: string) => void;
  setCampaignId: (id: number | null) => void;
}

export default function CampaignBuilder({ setPage, setCampaignId }: CampaignBuilderProps) {
  const [prompt, setPrompt] = useState<string>('Bring back customers who have not purchased in 60 days and spent more than ₹5000');
  const [loading, setLoading] = useState<boolean>(false);
  const [planGenerated, setPlanGenerated] = useState<boolean>(false);
  
  // Campaign options
  const [campaignName, setCampaignName] = useState<string>('');
  const [inactiveDays, setInactiveDays] = useState<number>(60);
  const [minSpend, setMinSpend] = useState<number>(5000);
  const [audienceDescription, setAudienceDescription] = useState<string>('');
  const [matchingCount, setMatchingCount] = useState<number>(0);
  
  const [channels, setChannels] = useState<string[]>(['whatsapp']);
  const [message, setMessage] = useState<string>('');
  const [subject, setSubject] = useState<string>('');
  const [tone, setTone] = useState<string>('casual');
  const [angle, setAngle] = useState<string>('Special Discount Promo');
  const [urgency, setUrgency] = useState<string>('Standard');
  
  const [regeneratingMessage, setRegeneratingMessage] = useState<boolean>(false);
  const [launching, setLaunching] = useState<boolean>(false);
  const [launchSuccess, setLaunchSuccess] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const { isRecording, isTranscribing, transcript: voiceTranscript, error: voiceError, startRecording, stopRecording, setTranscript: setVoiceTranscript } = useVoiceInput();
  
  const { 
    isRecording: isRecMsg, 
    isTranscribing: isTransMsg, 
    transcript: transcriptMsg, 
    startRecording: startRecMsg, 
    stopRecording: stopRecMsg, 
    setTranscript: setTranscriptMsg 
  } = useVoiceInput();

  useEffect(() => {
    if (voiceTranscript) {
      setPrompt(prev => prev ? `${prev} ${voiceTranscript}` : voiceTranscript);
      setVoiceTranscript('');
    }
  }, [voiceTranscript, setVoiceTranscript]);

  useEffect(() => {
    if (transcriptMsg) {
      setMessage(prev => prev ? `${prev} ${transcriptMsg}` : transcriptMsg);
      setTranscriptMsg('');
    }
  }, [transcriptMsg, setTranscriptMsg]);

  const API_URL = (import.meta.env.VITE_API_URL as string) || 'http://localhost:8000';
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (planGenerated) {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(async () => {
        try {
          const res = await fetch(`${API_URL}/api/ai/segment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: `inactive for ${inactiveDays} days, spent ${minSpend}` })
          });
          const data = await res.json();
          setMatchingCount(data.matching_count);
          setAudienceDescription(data.description);
        } catch (err) {
          console.error('Error recalculating audience size:', err);
        }
      }, 500);
    }
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [inactiveDays, minSpend, planGenerated, API_URL]);

  const handleGeneratePlan = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setErrorMessage('');
    try {
      const segRes = await fetch(`${API_URL}/api/ai/segment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      const segData = await segRes.json();
      
      setInactiveDays(segData.inactive_days || 60);
      setMinSpend(segData.min_spend || 5000);
      setAudienceDescription(segData.description);
      setMatchingCount(segData.matching_count);
      
      const words = prompt.split(' ').slice(0, 4).join(' ');
      setCampaignName(`AI Campaign: ${words}...`);

      let defaultChannels = ['whatsapp'];
      const promptLower = prompt.toLowerCase();
      if (promptLower.includes('email') || promptLower.includes('mail')) {
        defaultChannels = ['email'];
      } else if (promptLower.includes('sms') || promptLower.includes('text')) {
        defaultChannels = ['sms'];
      } else if (promptLower.includes('rcs')) {
        defaultChannels = ['rcs'];
      }
      setChannels(defaultChannels);

      const msgRes = await fetch(`${API_URL}/api/ai/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          segment_description: segData.description,
          angle: angle,
          urgency: urgency,
          tone: tone,
          channels: defaultChannels
        })
      });
      const msgData = await msgRes.json();
      
      setMessage(msgData.message);
      setSubject(msgData.subject || '');
      setPlanGenerated(true);
    } catch (err) {
      console.error('Failed to generate campaign plan:', err);
      setErrorMessage('Could not communicate with AI backend. Make sure the servers are running.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateMessage = async (newTone = tone, newChannels = channels) => {
    setRegeneratingMessage(true);
    try {
      const res = await fetch(`${API_URL}/api/ai/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          segment_description: audienceDescription,
          angle: angle,
          urgency: urgency,
          tone: newTone,
          channels: newChannels
        })
      });
      const data = await res.json();
      setMessage(data.message);
      setSubject(data.subject || '');
      setTone(newTone);
      setChannels(newChannels);
    } catch (err) {
      console.error('Error regenerating message:', err);
    } finally {
      setRegeneratingMessage(false);
    }
  };

  const handleLaunchCampaign = async () => {
    if (!campaignName.trim()) {
      setErrorMessage('Please provide a campaign name.');
      return;
    }
    setLaunching(true);
    setErrorMessage('');
    
    try {
      const draftRes = await fetch(`${API_URL}/api/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: campaignName,
          goal: prompt,
          channel: channels.join(','),
          message: channels.includes('email') && subject ? `Subject: ${subject}\n\n${message}` : message
        })
      });
      
      if (draftRes.status !== 200) throw new Error('Failed to create campaign draft.');
      const campaign = await draftRes.json();
      
      const launchRes = await fetch(`${API_URL}/api/campaigns/${campaign.id}/launch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inactive_days: inactiveDays,
          min_spend: minSpend
        })
      });
      
      const launchData = await launchRes.json();
      
      if (launchRes.status === 200) {
        setCampaignId(campaign.id);
        setLaunchSuccess(true);
        setTimeout(() => setPage('monitor'), 2000);
      } else {
        setErrorMessage(launchData.detail || 'Launch was rejected by server.');
      }
    } catch (err) {
      console.error('Launch failed:', err);
      setErrorMessage('Campaign launch failed due to connection error.');
    } finally {
      setLaunching(false);
    }
  };

  return (
    <motion.div 
      className="space-y-8 max-w-5xl"
      variants={stagger}
      initial="initial"
      animate="animate"
    >
      <motion.div variants={fadeUp}>
        <h1 className="text-3xl font-display font-bold tracking-tight text-txt-primary">AI Campaign Builder</h1>
        <p className="text-sm text-txt-secondary mt-1">Describe your marketing goal in plain English, and watch the AI coordinate your campaign.</p>
      </motion.div>

      {/* Prompter area */}
      <motion.div variants={fadeUp} className="card p-6 relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-accent/5 blur-3xl pointer-events-none" />
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <label className="text-[13px] font-medium text-txt-secondary flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-accent-light" />
              <span>Describe what you would like to achieve:</span>
            </label>
            <div className="relative">
              {isRecording && <div className="absolute inset-0 bg-rose-500/30 rounded-full animate-ping" />}
              <button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isTranscribing}
                className={`relative p-2 rounded-full transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  isRecording 
                    ? 'bg-rose-500 text-txt-primary shadow-[0_0_15px_rgba(244,63,94,0.5)]' 
                    : isTranscribing
                      ? 'bg-elevated text-accent cursor-not-allowed'
                      : 'bg-elevated border border-border-subtle text-txt-secondary hover:text-txt-primary hover:bg-border-subtle'
                }`}
                title={isRecording ? "Stop recording" : "Voice input via Deepgram"}
              >
                {isTranscribing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mic className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={2}
            className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl p-4 text-[13px] text-txt-primary focus:ring-2 focus:ring-accent focus:border-transparent outline-none transition-all resize-none placeholder-[var(--input-placeholder)] leading-relaxed"
            placeholder="e.g. Reach customers who haven't ordered in 60 days and spent over ₹5000..."
          />
          {voiceError && <p className="text-xs text-rose-400">{voiceError}</p>}
          
          <div className="flex justify-between items-center">
            <div className="flex gap-2">
              <input 
                type="text" 
                value={angle} 
                onChange={(e) => setAngle(e.target.value)}
                placeholder="Campaign Angle (e.g. Free Delivery)"
                className="bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl px-3 h-10 text-[12px] text-txt-primary placeholder-[var(--input-placeholder)] outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
              />
              <select
                value={urgency}
                onChange={(e) => setUrgency(e.target.value)}
                className="bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl px-3 h-10 text-[12px] text-txt-primary outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
              >
                <option value="Standard" className="bg-[var(--option-bg)]">Standard</option>
                <option value="Limited Time" className="bg-[var(--option-bg)]">Limited Time</option>
                <option value="Urgent/Flash Sale" className="bg-[var(--option-bg)]">Urgent</option>
              </select>
            </div>
            <button
              onClick={handleGeneratePlan}
              disabled={loading || !prompt.trim()}
              className="inline-flex items-center justify-center gap-2 accent-gradient text-txt-primary font-medium py-3 px-6 rounded-xl shadow-glow-accent/30 hover:shadow-glow-accent disabled:opacity-50 transition-all duration-200 text-[13px] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {loading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Coordinating...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Generate Plan</span>
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {errorMessage && (
          <motion.div initial={{opacity:0, y:-10}} animate={{opacity:1, y:0}} exit={{opacity:0, y:-10}} className="p-4 rounded-xl border bg-rose-400/10 border-rose-400/20 text-rose-400 text-[13px] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMessage}</span>
          </motion.div>
        )}
        {launchSuccess && (
          <motion.div initial={{opacity:0, y:-10}} animate={{opacity:1, y:0}} exit={{opacity:0, y:-10}} className="p-4 rounded-xl border bg-emerald-400/10 border-emerald-400/20 text-emerald-400 text-[13px] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>Campaign launched successfully! Redirecting to monitor feed...</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Campaign Details Workspace */}
      {planGenerated && (
        <motion.div 
          className="space-y-6"
          initial="initial"
          animate="animate"
          variants={stagger}
        >
          <motion.div variants={fadeUp} className="card p-6 space-y-3">
            <h3 className="text-xs font-display font-bold text-txt-secondary uppercase tracking-wider">Campaign Name</h3>
            <input 
              type="text" 
              value={campaignName} 
              onChange={(e) => setCampaignName(e.target.value)}
              className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl p-3 text-[13px] font-medium text-txt-primary focus:ring-2 focus:ring-accent focus:border-transparent outline-none transition-all"
            />
          </motion.div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Left Column: Segment Settings */}
            <motion.div variants={fadeUp} className="card p-6 space-y-6">
              <div className="flex justify-between items-center border-b border-border-subtle pb-3">
                <h3 className="text-base font-display font-bold text-txt-primary flex items-center gap-2">
                  <Users className="w-4 h-4 text-accent-light" />
                  <span>Audience Details</span>
                </h3>
                <span className="text-[11px] text-accent-light font-medium px-3 py-1 bg-accent-muted rounded-xl border border-accent/20">
                  {matchingCount.toLocaleString()} Matching
                </span>
              </div>

              {/* Sliders */}
              <div className="space-y-2">
                <div className="flex justify-between text-[11px] text-txt-secondary">
                  <span className="uppercase tracking-wide">Inactive Days</span>
                  <span className="text-txt-primary font-medium">{inactiveDays} days</span>
                </div>
                <input 
                  type="range" min="0" max="180" 
                  value={inactiveDays} onChange={(e) => setInactiveDays(parseInt(e.target.value))}
                  className="w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-[11px] text-txt-secondary">
                  <span className="uppercase tracking-wide">Min Spend</span>
                  <span className="text-txt-primary font-medium">₹{minSpend.toLocaleString('en-IN')}</span>
                </div>
                <input 
                  type="range" min="0" max="15000" step="500"
                  value={minSpend} onChange={(e) => setMinSpend(parseInt(e.target.value))}
                  className="w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                />
              </div>

              <div className="text-[12px] text-txt-secondary leading-relaxed bg-elevated/40 border border-border-subtle rounded-xl p-4">
                <p className="font-medium text-txt-secondary">Current segment filter:</p>
                <p className="mt-1 text-txt-primary capitalize italic">"{audienceDescription}"</p>
              </div>
            </motion.div>

            {/* Right Column: Content */}
            <motion.div variants={fadeUp} className="card p-6 space-y-6">
              <div className="flex justify-between items-center border-b border-border-subtle pb-3">
                <h3 className="text-base font-display font-bold text-txt-primary flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-accent-light" />
                  <span>Channel & Content</span>
                </h3>
              </div>

              {/* Channels */}
              <div className="space-y-2.5">
                <label className="text-[11px] text-txt-secondary font-medium uppercase tracking-wide">Channels</label>
                <div className="flex flex-wrap gap-2">
                  {['whatsapp', 'sms', 'email', 'rcs'].map((ch) => {
                    const isSelected = channels.includes(ch);
                    return (
                      <button
                        key={ch}
                        onClick={() => {
                          const newChannels = isSelected ? channels.filter(c => c !== ch) : [...channels, ch];
                          if (newChannels.length > 0) handleRegenerateMessage(tone, newChannels);
                        }}
                        className={`capitalize text-[11px] font-medium px-3 py-2 rounded-xl border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                          isSelected 
                            ? 'bg-accent-muted border-accent/40 text-accent-light' 
                            : 'bg-elevated border-border-subtle text-txt-secondary hover:text-txt-primary'
                        }`}
                      >
                        {ch}
                      </button>
                    )
                  })}
                </div>
              </div>

              {channels.includes('email') && (
                <div className="space-y-2">
                  <label className="text-[11px] text-txt-secondary font-medium uppercase tracking-wide">Email Subject</label>
                  <input 
                    type="text" value={subject} onChange={(e) => setSubject(e.target.value)}
                    className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] text-txt-primary rounded-xl p-3 text-[12px] focus:ring-2 focus:ring-accent focus:border-transparent outline-none transition-all placeholder-[var(--input-placeholder)]"
                    placeholder="Enter subject..."
                  />
                </div>
              )}

              {/* Message */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-[11px] text-txt-secondary font-medium uppercase tracking-wide">Message Template</label>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-txt-secondary italic">Supports [Name] tag</span>
                    <button
                      onClick={isRecMsg ? stopRecMsg : startRecMsg}
                      disabled={isTransMsg}
                      className={`p-1.5 rounded-full transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                        isRecMsg 
                          ? 'bg-rose-500 text-txt-primary shadow-[0_0_10px_rgba(244,63,94,0.5)] animate-pulse' 
                          : isTransMsg
                            ? 'bg-elevated text-accent cursor-not-allowed'
                            : 'bg-elevated border border-border-subtle text-txt-secondary hover:text-txt-primary hover:bg-border-subtle'
                      }`}
                    >
                      {isTransMsg ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mic className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
                <textarea 
                  value={message} onChange={(e) => setMessage(e.target.value)} rows={4}
                  className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] text-txt-primary rounded-xl p-3 text-[13px] focus:ring-2 focus:ring-accent focus:border-transparent outline-none leading-relaxed resize-none placeholder-[var(--input-placeholder)] transition-all"
                />
              </div>

              {/* Tone */}
              <div className="space-y-2.5">
                <span className="text-[11px] text-txt-secondary font-medium block uppercase tracking-wide">Copy Tone</span>
                <div className="flex justify-between items-center gap-3">
                  <div className="flex gap-1.5">
                    {['casual', 'formal', 'urgent'].map((t) => (
                      <button
                        key={t}
                        onClick={() => handleRegenerateMessage(t, channels)}
                        className={`capitalize text-[11px] font-medium px-3 py-2 rounded-xl border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                          tone === t 
                            ? 'bg-accent-muted border-accent/40 text-accent-light' 
                            : 'bg-elevated border-border-subtle text-txt-secondary hover:text-txt-primary'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <button 
                    onClick={() => handleRegenerateMessage(tone, channels)}
                    disabled={regeneratingMessage}
                    className="text-[11px] text-txt-secondary hover:text-txt-primary flex items-center gap-1 hover:underline transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-xl px-2 py-1"
                  >
                    <RefreshCw className={`w-3 h-3 ${regeneratingMessage ? 'animate-spin text-accent-light' : ''}`} />
                    <span>AI Rewrite</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Launch */}
          <motion.div variants={fadeUp} className="card p-6 flex flex-col md:flex-row justify-between items-center gap-4 bg-elevated/20">
            <div className="space-y-1 text-center md:text-left">
              <h4 className="font-display font-bold text-base text-txt-primary">Ready to activate this campaign?</h4>
              <p className="text-[12px] text-txt-secondary">
                Will create {matchingCount.toLocaleString()} dispatch entries and send them to the simulator.
              </p>
            </div>
            
            <button
              onClick={handleLaunchCampaign}
              disabled={launching || matchingCount === 0 || launchSuccess}
              className="inline-flex items-center gap-2 accent-gradient text-txt-primary font-medium py-3 px-6 rounded-xl shadow-glow-accent/30 hover:shadow-glow-accent disabled:opacity-50 transition-all duration-200 text-[13px] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {launching ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Launching...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Launch Campaign</span>
                </>
              )}
            </button>
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  );
}
