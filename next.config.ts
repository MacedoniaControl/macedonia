import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Las actas de conteo se generan en el servidor con pdfmake (sobre pdfkit) y
  // exceljs. Leen sus propios archivos al cargarse: empaquetarlos los rompe, asi
  // que se cargan tal cual desde node_modules.
  serverExternalPackages: ["pdfmake", "pdfkit", "exceljs"],
};

export default nextConfig;
