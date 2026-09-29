import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // docxtemplater, mammoth y sharp corren solo en el servidor (runtime Node).
  serverExternalPackages: ['sharp', 'docxtemplater', 'docxtemplater-image-module-free', 'pizzip', 'mammoth'],
};

export default nextConfig;
