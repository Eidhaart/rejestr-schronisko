import { getSession } from "../../../lib/session";
import { loadAnimals } from "../../../lib/data";
import { buildCsv, buildEventsCsv, buildXlsx, exportFilename } from "../../../lib/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const session = getSession();
  if (!session || session.role !== "admin") {
    return new Response("Brak uprawnień.", { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const format = params.get("format") === "xlsx" ? "xlsx" : "csv";
  const animals = await loadAnimals(session, { gminaId: params.get("gmina") || null });

  if (format === "xlsx") {
    return new Response(buildXlsx(animals), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${exportFilename("xlsx")}"`,
      },
    });
  }

  const historia = params.get("sheet") === "historia";
  return new Response(historia ? buildEventsCsv(animals) : buildCsv(animals), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFilename("csv", historia ? "-historia" : "")}"`,
    },
  });
}
