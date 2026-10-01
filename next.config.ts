import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Las actas de conteo se generan en el servidor con pdfmake (sobre pdfkit) y
  // exceljs. Leen sus propios archivos al cargarse: empaquetarlos los rompe, asi
  // que se cargan tal cual desde node_modules.
  serverExternalPackages: ["pdfmake", "pdfkit", "exceljs"],
  // La importación de ventas de Valery manda los renglones a una acción de
  // servidor: un año de ventas pasa del 1 MB por defecto. Vercel admite 4,5 MB.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
};

export default nextConfig;
