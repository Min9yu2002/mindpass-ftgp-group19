"use client";

import Image from "next/image";
import { useState, useRef, useCallback } from "react";
import GlassCard from "../../components/GlassCard";
import SectionHeading from "../../components/SectionHeading";

export default function TherapistOnboardingPage() {
  // 表單提交流程狀態
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [scanStep, setScanStep] = useState(0);

  // 攝影機狀態
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  // 打開攝影機 (加上了安全檢查防呆機制)
  const startCamera = async () => {
    // 檢查瀏覽器是否支援或是否在安全環境
    if (typeof navigator === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("⚠️ Your browser or current environment does not support camera access. Please ensure you are on localhost or HTTPS.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      setIsCameraOpen(true);
      // 等待 React 渲染 video 元素後綁定串流
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);
    } catch (err) {
      console.error("Camera access denied or failed", err);
      alert("Please allow camera permissions in your browser to complete eKYC.");
    }
  };

  // 拍照捕捉人臉
  const captureFace = useCallback(() => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext("2d");
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);
        
        const imageData = canvasRef.current.toDataURL("image/jpeg");
        setCapturedImage(imageData);
        
        // 關閉攝影機串流，釋放資源
        const stream = videoRef.current.srcObject as MediaStream;
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }
        setIsCameraOpen(false);
      }
    }
  }, []);

  // 模擬 AI eKYC 掃描步驟
  const scanMessages = [
    "Initiating secure connection...",
    "Uploading encrypted documents to eKYC Oracle...",
    "Running AI Biometric Match on Selfie vs. ID...",
    "Extracting Passport OCR data...",
    "Cross-referencing Medical License via Gov API...",
    "Generating Zero-Knowledge Proof for SBT minting...",
    "Finalizing NGO Oracle approval..."
  ];

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!capturedImage) {
      alert("Please complete the Facial Biometric Scan before submitting.");
      return;
    }

    setIsSubmitting(true);
    setScanStep(0);

    let currentStep = 0;
    const interval = setInterval(() => {
      currentStep += 1;
      if (currentStep < scanMessages.length) {
        setScanStep(currentStep);
      } else {
        clearInterval(interval);
        setIsSubmitting(false);
        setIsSubmitted(true);
      }
    }, 1200);
  };

  return (
    <main className="app-shell page-canvas page-canvas-provider relative min-h-screen overflow-hidden bg-background pt-32 text-foreground md:pt-36">
      <div className="relative mx-auto w-full max-w-7xl px-6 py-10 lg:px-10">
        <section className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          
          {/* 左側：介紹與規範 */}
          <div>
            <SectionHeading
              eyebrow="Therapist eKYC"
              title="Identity verification & Soulbound Token issuance."
              description="MindPass utilizes advanced eKYC (Electronic Know Your Customer) protocols. Approved providers receive a non-transferable Soulbound Token (SBT) minted to their submitted wallet."
            />

            <div className="mt-8 space-y-4">
              <div className="liquid-glass-soft rounded-[24px] p-5 border border-emerald-500/20 bg-emerald-500/5">
                <p className="text-sm font-medium text-emerald-300">
                  Strict eKYC Integration
                </p>
                <p className="mt-2 text-sm leading-6 text-white/60">
                  We use live facial scanning to match your biometrics with your government ID, preventing impersonation and ensuring patient safety.
                </p>
              </div>
            </div>
          </div>

          <GlassCard className="glass-panel p-6 sm:p-8">
            {!isSubmitting && !isSubmitted ? (
              <form onSubmit={handleSubmit} className="space-y-8">
                
                {/* 區塊 1：基本與專業資料 */}
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-[var(--text-faint)]">Section 1</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Professional Profile</h2>
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <label className="block sm:col-span-2">
                      <span className="mb-2 block text-sm text-[var(--text-secondary)]">Full Legal Name</span>
                      <input required className="form-input w-full" placeholder="Dr. Jane Doe" />
                    </label>
                    
                    {/* 新增：工作 Email (接收通知用) */}
                    <label className="block sm:col-span-2">
                      <span className="mb-2 flex justify-between text-sm text-[var(--text-secondary)]">
                        <span>Work Email</span>
                        <span className="text-xs text-white/40">Private</span>
                      </span>
                      <input required type="email" className="form-input w-full" placeholder="dr.jane@example.com" />
                      <span className="mt-2 block text-xs text-violet-300/70">Used exclusively for secure appointment notifications.</span>
                    </label>

                    <label className="block sm:col-span-2">
                      <span className="mb-2 block text-sm text-[var(--text-secondary)]">Web3 Wallet Address</span>
                      <input required className="form-input w-full" placeholder="0x..." />
                      <span className="mt-2 block text-xs text-violet-300/70">This is the wallet where your therapist SBT will be minted.</span>
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-sm text-[var(--text-secondary)]">Clinical Specialty</span>
                      <input required className="form-input w-full" placeholder="Trauma, Anxiety" />
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-sm text-[var(--text-secondary)]">Languages Spoken</span>
                      <input required className="form-input w-full" placeholder="English, Mandarin" />
                    </label>
                    
                    <label className="block sm:col-span-2">
                      <span className="mb-2 flex justify-between text-sm text-[var(--text-secondary)]">
                        <span>Professional Bio & Resume</span>
                        <span className="text-xs text-white/40">Visible to patients</span>
                      </span>
                      <textarea 
                        required 
                        rows={4}
                        className="form-input w-full resize-none leading-relaxed" 
                        placeholder="Briefly describe your approach to therapy, your background, and the types of clients you typically work with..." 
                      />
                    </label>
                  </div>
                </div>

                {/* 區塊 2：靜態文件上傳 */}
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-[var(--text-faint)]">Section 2</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Verification Documents</h2>
                  <div className="mt-5 space-y-4">
                    <label className="liquid-glass-soft block rounded-[24px] border border-dashed border-white/15 p-5 hover:border-violet-500/50 transition cursor-pointer">
                      <span className="block text-sm font-medium text-white">Medical/Counseling License</span>
                      <span className="mt-1 block text-sm text-[var(--text-muted)]">Upload a PDF or image of your active professional license.</span>
                      <input required type="file" accept=".pdf,image/*" className="mt-3 block w-full text-sm text-white/50 file:mr-4 file:rounded-full file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white" />
                    </label>
                    <label className="liquid-glass-soft block rounded-[24px] border border-dashed border-white/15 p-5 hover:border-violet-500/50 transition cursor-pointer">
                      <span className="block text-sm font-medium text-white">Government Issued ID or Passport</span>
                      <span className="mt-1 block text-sm text-[var(--text-muted)]">Submit a clear image or PDF for identity verification.</span>
                      <input required type="file" accept=".pdf,image/*" className="mt-3 block w-full text-sm text-white/50 file:mr-4 file:rounded-full file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white" />
                    </label>
                  </div>
                </div>

                {/* 區塊 3：活體掃描 */}
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-[var(--text-faint)]">Section 3</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Biometric Liveness Check</h2>
                  <div className="mt-5">
                    <div className="liquid-glass-soft rounded-[24px] border border-dashed border-emerald-500/50 p-6 text-center">
                      <h3 className="text-sm font-medium text-emerald-400">eKYC Face Scan (Similar to Yoti)</h3>
                      <p className="mt-1 mb-5 text-xs text-[var(--text-muted)]">
                        We will compare your live selfie against your uploaded ID using AI.
                      </p>

                      {!isCameraOpen && !capturedImage && (
                        <button
                          type="button"
                          onClick={startCamera}
                          className="rounded-full bg-emerald-500/20 px-6 py-3 text-sm font-bold text-emerald-300 transition hover:bg-emerald-500/30"
                        >
                          Open Camera & Scan Face
                        </button>
                      )}

                      {isCameraOpen && (
                        <div className="flex flex-col items-center">
                          <div className="relative h-56 w-56 overflow-hidden rounded-full border-4 border-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.4)]">
                            <video
                              ref={videoRef}
                              autoPlay
                              playsInline
                              className="h-full w-full object-cover scale-x-[-1]"
                            />
                            <div className="absolute top-0 left-0 h-1 w-full bg-emerald-400 shadow-[0_0_15px_rgba(16,185,129,1)] opacity-70 animate-pulse"></div>
                          </div>
                          <button
                            type="button"
                            onClick={captureFace}
                            className="mt-6 rounded-full bg-emerald-500 px-8 py-3 text-sm font-bold text-black transition hover:bg-emerald-400"
                          >
                            Capture & Match ID
                          </button>
                        </div>
                      )}

                      {capturedImage && (
                        <div className="flex flex-col items-center">
                          <Image
                            src={capturedImage}
                            alt="Captured Face"
                            width={128}
                            height={128}
                            className="h-32 w-32 rounded-full border-2 border-emerald-500 object-cover scale-x-[-1]"
                          />
                          <p className="mt-3 text-sm font-bold text-emerald-400">✓ Biometric Data Captured</p>
                          <button
                            type="button"
                            onClick={() => setCapturedImage(null)}
                            className="mt-2 text-xs text-white/50 hover:text-white underline"
                          >
                            Retake Photo
                          </button>
                        </div>
                      )}

                      <canvas ref={canvasRef} className="hidden" />
                    </div>
                  </div>
                </div>

                <button 
                  type="submit" 
                  disabled={isSubmitting || !capturedImage}
                  className={`button-primary w-full rounded-2xl px-5 py-4 text-sm font-semibold transition hover:scale-[1.02] ${(!capturedImage) ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  Submit for AI eKYC Verification
                </button>
              </form>
            ) : isSubmitting ? (
              <div className="flex min-h-[600px] flex-col items-center justify-center text-center px-10">
                <div className="relative flex h-24 w-24 items-center justify-center">
                  <div className="absolute h-full w-full rounded-full border-4 border-violet-500/20 border-t-violet-500 animate-spin"></div>
                  <span className="text-xl font-bold text-violet-400">{Math.round((scanStep / (scanMessages.length - 1)) * 100)}%</span>
                </div>
                <h2 className="mt-8 text-2xl font-semibold text-white">Processing eKYC Request</h2>
                
                <div className="mt-6 w-full max-w-md rounded-xl bg-black/40 p-5 border border-white/5 text-left font-mono text-sm text-emerald-400 h-40 overflow-hidden relative">
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/80 pointer-events-none z-10"></div>
                  <div className="flex flex-col gap-3 transition-transform duration-300" style={{ transform: `translateY(-${Math.max(0, scanStep - 2) * 32}px)` }}>
                    {scanMessages.slice(0, scanStep + 1).map((msg, idx) => (
                      <div key={idx} className="flex items-start gap-2 animate-pulse">
                        <span className="text-white/30">{'>'}</span> 
                        <span className={idx === scanStep ? "text-emerald-300 font-bold" : "text-emerald-500/60"}>{msg}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[600px] flex-col items-center justify-center text-center">
                <div className="liquid-glass-soft flex h-24 w-24 items-center justify-center rounded-full border-2 border-emerald-500/50 bg-emerald-500/10 text-4xl text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                  ✓
                </div>
                <h2 className="mt-8 text-3xl font-semibold text-white">
                  Identity Verified
                </h2>
                <p className="mt-4 max-w-xl text-base leading-7 text-[var(--text-muted)]">
                  Your biometric data matches your documents perfectly. The NGO Oracle has approved your application.
                </p>
                <div className="mt-8 rounded-2xl border border-white/10 bg-black/20 p-5 w-full max-w-sm">
                  <p className="text-sm text-white/50">Your Soulbound Token (SBT) is being minted to:</p>
                  <p className="mt-2 font-mono text-sm text-violet-300 bg-black/50 py-2 rounded-lg">0x... (Your Wallet)</p>
                </div>
                <button className="mt-8 button-primary rounded-full px-8 py-3 text-sm font-medium">
                  Enter Therapist Portal
                </button>
              </div>
            )}
          </GlassCard>
        </section>
      </div>
    </main>
  );
}
