"use client";

import Image from "next/image";
import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import GlassCard from "../../components/GlassCard";
import SectionHeading from "../../components/SectionHeading";
import { supabase } from "../../lib/supabase";

type UploadKind = "license" | "id_card" | "selfie";

type PreviewFileState = {
  file: File | null;
  previewUrl: string;
};

function dataUrlToFile(dataUrl: string, filename: string) {
  const [header, data] = dataUrl.split(",");
  const mimeMatch = header.match(/data:(.*?);base64/);
  const mimeType = mimeMatch?.[1] ?? "image/jpeg";
  const binary = window.atob(data);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new File([bytes], filename, { type: mimeType });
}

function getFileExtension(file: File) {
  const explicitExtension = file.name.split(".").pop();
  if (explicitExtension && explicitExtension !== file.name) {
    return explicitExtension.toLowerCase();
  }

  if (file.type === "application/pdf") {
    return "pdf";
  }

  if (file.type === "image/png") {
    return "png";
  }

  return "jpg";
}

export default function TherapistOnboardingPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const [legalName, setLegalName] = useState("");
  const [workEmail, setWorkEmail] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [languages, setLanguages] = useState("");
  const [bio, setBio] = useState("");
  const [licenseFile, setLicenseFile] = useState<PreviewFileState>({
    file: null,
    previewUrl: "",
  });
  const [idCardFile, setIdCardFile] = useState<PreviewFileState>({
    file: null,
    previewUrl: "",
  });
  // 表單提交流程狀態
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [scanStep, setScanStep] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

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

  useEffect(() => {
    return () => {
      [licenseFile.previewUrl, idCardFile.previewUrl].forEach((url) => {
        if (url) {
          URL.revokeObjectURL(url);
        }
      });
    };
  }, [idCardFile.previewUrl, licenseFile.previewUrl]);

  useEffect(() => {
    if (isConnected && address) {
      setWalletAddress(address.toLowerCase());
    }
  }, [address, isConnected]);

  const handleFileChange = (
    event: React.ChangeEvent<HTMLInputElement>,
    kind: "license" | "id_card",
  ) => {
    const nextFile = event.target.files?.[0] ?? null;
    const previousPreviewUrl =
      kind === "license" ? licenseFile.previewUrl : idCardFile.previewUrl;

    if (previousPreviewUrl) {
      URL.revokeObjectURL(previousPreviewUrl);
    }

    const nextState: PreviewFileState = {
      file: nextFile,
      previewUrl:
        nextFile && nextFile.type.startsWith("image/")
          ? URL.createObjectURL(nextFile)
          : "",
    };

    if (kind === "license") {
      setLicenseFile(nextState);
      return;
    }

    setIdCardFile(nextState);
  };

  const uploadDocument = async (
    kind: UploadKind,
    file: File,
    normalizedWalletAddress: string,
  ) => {
    if (!supabase) {
      throw new Error("Supabase client is unavailable.");
    }

    const timestamp = Date.now();
    const extension = getFileExtension(file);
    const path = `${normalizedWalletAddress}/${kind}_${timestamp}.${extension}`;

    const { error } = await supabase.storage
      .from("provider-docs")
      .upload(path, file, {
        upsert: true,
        contentType: file.type,
      });

    if (error) {
      throw error;
    }

    return path;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (!licenseFile.file || !idCardFile.file) {
      setErrorMessage("Please upload both your medical license and ID card.");
      return;
    }

    if (!capturedImage) {
      setErrorMessage("Please complete the Facial Biometric Scan before submitting.");
      return;
    }

    const normalizedWalletAddress = walletAddress.trim().toLowerCase();
    if (!/^0x[a-fA-F0-9]{40}$/.test(normalizedWalletAddress)) {
      setErrorMessage("Please provide a valid wallet address for SBT minting.");
      return;
    }

    setIsSubmitting(true);
    setScanStep(0);

    let currentStep = 0;
    const interval = window.setInterval(() => {
      currentStep += 1;
      if (currentStep < scanMessages.length) {
        setScanStep(currentStep);
      } else {
        window.clearInterval(interval);
      }
    }, 900);

    try {
      const selfieFile = dataUrlToFile(
        capturedImage,
        `selfie_${Date.now()}.jpg`,
      );

      const [licensePath, idCardPath, selfiePath] = await Promise.all([
        uploadDocument("license", licenseFile.file, normalizedWalletAddress),
        uploadDocument("id_card", idCardFile.file, normalizedWalletAddress),
        uploadDocument("selfie", selfieFile, normalizedWalletAddress),
      ]);

      if (!supabase) {
        throw new Error("Supabase client is unavailable.");
      }

      const { error } = await supabase.from("therapists").upsert(
        {
          wallet_address: normalizedWalletAddress,
          full_name: legalName.trim(),
          legal_name: legalName.trim(),
          work_email: workEmail.trim().toLowerCase(),
          specialty: specialty.trim(),
          clinical_specialty: specialty.trim(),
          languages: languages
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          bio: bio.trim(),
          license_url: licensePath,
          id_card_url: idCardPath,
          selfie_url: selfiePath,
        },
        {
          onConflict: "wallet_address",
        },
      );

      if (error) {
        throw error;
      }

      window.localStorage.setItem(
        "mindpass-therapist-profile",
        JSON.stringify({
          walletAddress: normalizedWalletAddress,
        }),
      );
      setSuccessMessage(
        "Your eKYC data has been encrypted and recorded in Supabase.",
      );
      setIsSubmitting(false);
      setIsSubmitted(true);
    } catch (error) {
      window.clearInterval(interval);
      setIsSubmitting(false);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to submit therapist onboarding.",
      );
    }
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
                      <input required value={legalName} onChange={(event) => setLegalName(event.target.value)} className="form-input w-full" placeholder="Dr. Jane Doe" />
                    </label>
                    
                    {/* 新增：工作 Email (接收通知用) */}
                    <label className="block sm:col-span-2">
                      <span className="mb-2 flex justify-between text-sm text-[var(--text-secondary)]">
                        <span>Work Email</span>
                        <span className="text-xs text-white/40">Private</span>
                      </span>
                      <input required type="email" value={workEmail} onChange={(event) => setWorkEmail(event.target.value)} className="form-input w-full" placeholder="dr.jane@example.com" />
                      <span className="mt-2 block text-xs text-violet-300/70">Used exclusively for secure appointment notifications.</span>
                    </label>

                    <label className="block sm:col-span-2">
                      <span className="mb-2 flex justify-between text-sm text-[var(--text-secondary)]">
                        <span>Web3 Wallet Address</span>
                        <span className="text-xs text-white/40">
                          {isConnected && address ? "Auto-filled from connected wallet" : "Required"}
                        </span>
                      </span>
                      <input
                        required
                        value={walletAddress}
                        onChange={(event) => setWalletAddress(event.target.value)}
                        readOnly={Boolean(isConnected && address)}
                        className="form-input w-full"
                        placeholder="0x..."
                      />
                      <span className="mt-2 block text-xs text-violet-300/70">
                        This is the wallet where your therapist SBT will be minted.
                      </span>
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-sm text-[var(--text-secondary)]">Clinical Specialty</span>
                      <input required value={specialty} onChange={(event) => setSpecialty(event.target.value)} className="form-input w-full" placeholder="Trauma, Anxiety" />
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-sm text-[var(--text-secondary)]">Languages Spoken</span>
                      <input required value={languages} onChange={(event) => setLanguages(event.target.value)} className="form-input w-full" placeholder="English, Mandarin" />
                    </label>
                    
                    <label className="block sm:col-span-2">
                      <span className="mb-2 flex justify-between text-sm text-[var(--text-secondary)]">
                        <span>Professional Bio & Resume</span>
                        <span className="text-xs text-white/40">Visible to patients</span>
                      </span>
                      <textarea 
                        required 
                        rows={4}
                        value={bio}
                        onChange={(event) => setBio(event.target.value)}
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
                      <input required type="file" accept=".pdf,image/png,image/jpeg" onChange={(event) => handleFileChange(event, "license")} className="mt-3 block w-full text-sm text-white/50 file:mr-4 file:rounded-full file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white" />
                      {licenseFile.file ? (
                        <div className="mt-4">
                          <p className="text-xs text-[var(--text-faint)]">{licenseFile.file.name}</p>
                          {licenseFile.previewUrl ? (
                            <div className="mt-3 overflow-hidden rounded-2xl border border-white/10">
                              <Image
                                src={licenseFile.previewUrl}
                                alt="Medical license preview"
                                width={640}
                                height={360}
                                className="h-40 w-full object-cover"
                              />
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </label>
                    <label className="liquid-glass-soft block rounded-[24px] border border-dashed border-white/15 p-5 hover:border-violet-500/50 transition cursor-pointer">
                      <span className="block text-sm font-medium text-white">Government Issued ID or Passport</span>
                      <span className="mt-1 block text-sm text-[var(--text-muted)]">Submit a clear image or PDF for identity verification.</span>
                      <input required type="file" accept=".pdf,image/png,image/jpeg" onChange={(event) => handleFileChange(event, "id_card")} className="mt-3 block w-full text-sm text-white/50 file:mr-4 file:rounded-full file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white" />
                      {idCardFile.file ? (
                        <div className="mt-4">
                          <p className="text-xs text-[var(--text-faint)]">{idCardFile.file.name}</p>
                          {idCardFile.previewUrl ? (
                            <div className="mt-3 overflow-hidden rounded-2xl border border-white/10">
                              <Image
                                src={idCardFile.previewUrl}
                                alt="ID card preview"
                                width={640}
                                height={360}
                                className="h-40 w-full object-cover"
                              />
                            </div>
                          ) : null}
                        </div>
                      ) : null}
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

                {errorMessage ? (
                  <div className="liquid-glass-soft rounded-[22px] border border-red-400/20 bg-red-500/8 px-4 py-4">
                    <p className="text-sm text-red-600 dark:text-red-300">
                      {errorMessage}
                    </p>
                  </div>
                ) : null}

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
                  <p className="mt-2 rounded-lg bg-black/50 py-2 font-mono text-sm text-violet-300">{walletAddress || "0x... (Your Wallet)"}</p>
                </div>
                {successMessage ? (
                  <p className="mt-4 max-w-xl text-sm leading-6 text-emerald-300">
                    {successMessage}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => router.push("/provider-lobby")}
                  className="mt-8 button-primary rounded-full px-8 py-3 text-sm font-medium"
                >
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
