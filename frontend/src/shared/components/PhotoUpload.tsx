import React, { useEffect, useRef, useState } from 'react';
import { Camera } from 'lucide-react';

import { useTheme } from '@/shared/context/ThemeContext';
import { api } from '@/shared/lib/api';

export const PhotoUpload = ({
  patientId,
  current,
  onUpdated,
}: {
  patientId: number;
  current: string;
  onUpdated: (b64: string) => void;
}) => {
  const { dark } = useTheme();
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string>(current || '');
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPreview(current || '');
  }, [current]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = async () => {
      const b64 = reader.result as string;
      setPreview(b64);
      setUploading(true);
      try {
        await api(`/api/patients/${patientId}/photo`, { method: 'POST', body: JSON.stringify({ photo: b64 }) });
        onUpdated(b64);
      } finally {
        setUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const btnCls = `flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border font-semibold transition-all ${
    dark
      ? 'border-gray-600 text-gray-400 hover:text-teal-400 hover:border-teal-600 bg-gray-800'
      : 'border-gray-200 text-gray-500 hover:text-teal-600 hover:border-teal-400 bg-white'
  }`;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24">
        {preview ? (
          <img src={preview} alt="patient" className="w-24 h-24 rounded-2xl object-cover border-2 border-white shadow-md" />
        ) : (
          <div
            className={`w-24 h-24 rounded-2xl flex flex-col items-center justify-center border-2 border-dashed ${
              dark ? 'border-gray-600 bg-gray-700/50 text-gray-500' : 'border-gray-300 bg-gray-50 text-gray-400'
            }`}
          >
            <Camera className="w-6 h-6 mb-1" />
            <span className="text-xs font-bold">Photo</span>
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 rounded-2xl bg-black/60 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      <div className="flex gap-1.5">
        <button type="button" onClick={() => cameraRef.current?.click()} disabled={uploading} className={btnCls}>
          <Camera className="w-3 h-3" /> Caméra
        </button>
        <button type="button" onClick={() => galleryRef.current?.click()} disabled={uploading} className={btnCls}>
          Galerie
        </button>
      </div>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
        disabled={uploading}
      />
      <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={handleFile} disabled={uploading} />
    </div>
  );
};
