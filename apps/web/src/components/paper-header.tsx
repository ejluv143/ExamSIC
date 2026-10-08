import type { CSSProperties } from "react";
import type { PaperHeader as Header } from "@examora/contract";
import type { PaperKind } from "@/lib/types";
import { paperTitle, semesterLabel } from "@/lib/format";

// Sizes are in cqw (percent of the paper's width) so the letterhead scales like a printed page.
const navy = "#002060";
const line = "1px solid #c4c4c4";
const serif = '"Bookman Old Style", "URW Bookman", "Century Schoolbook", Georgia, serif';
const sans = 'Calibri, Carlito, "Segoe UI", Arial, sans-serif';

const cell: CSSProperties = { border: line, padding: "0 0.9cqw", verticalAlign: "top" };

// School letterhead at the top of a test paper. Always navy on white, like the printed page.
export function PaperHeader({ header, kind, dates }: { header: Header; kind: PaperKind; dates: string }) {
  const logos = [header.schoolLogoUrl, header.departmentLogoUrl].filter((x): x is string => !!x);
  const textWidth = `${(100 - logos.length * 12) / 2}%`;
  const schoolYear = [semesterLabel[header.semester], header.academicYear && `A.Y. ${header.academicYear}`]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="@container bg-white">
      <table
        className="w-full border-collapse"
        style={{ color: navy, fontFamily: sans, lineHeight: 1.15, tableLayout: "fixed" }}
      >
        <colgroup>
          {logos.map((_, i) => (
            <col key={i} style={{ width: "12%" }} />
          ))}
          <col style={{ width: textWidth }} />
          <col style={{ width: textWidth }} />
        </colgroup>
        <tbody>
          <tr style={{ height: "4.5cqw" }}>
            {logos.map((src, i) => (
              <td key={i} rowSpan={3} style={{ border: line, padding: "0.15cqw 0", verticalAlign: "middle" }}>
                <div style={{ border: line, padding: "0.3cqw", width: "9.6cqw", margin: "0 auto" }}>
                  {/* Uploads are data: URLs, so next/image optimization doesn't apply. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="aspect-square w-full object-contain" />
                </div>
              </td>
            ))}
            <td style={cell}>
              <p style={{ fontFamily: serif, fontWeight: 700, fontSize: "2.34cqw", textTransform: "uppercase" }}>
                {header.school || "School name"}
              </p>
              {header.schoolAddress && <p style={{ fontSize: "1.35cqw" }}>{header.schoolAddress}</p>}
            </td>
            <td style={{ ...cell, textAlign: "right", paddingTop: "0.3cqw" }}>
              <p style={{ fontWeight: 700, fontSize: "2cqw", textTransform: "uppercase" }}>{schoolYear}</p>
            </td>
          </tr>
          <tr style={{ height: "3.4cqw" }}>
            <td style={{ ...cell, paddingTop: "0.2cqw" }}>
              <p style={{ fontWeight: 700, fontSize: "2cqw", textTransform: "uppercase" }}>{header.department}</p>
            </td>
            <td style={{ ...cell, textAlign: "right", verticalAlign: "middle" }}>
              <p style={{ fontWeight: 700, fontSize: "2.7cqw", textTransform: "uppercase" }}>
                {paperTitle(kind, header.period)}
              </p>
            </td>
          </tr>
          <tr style={{ height: "2.9cqw" }}>
            <td style={cell} />
            <td style={{ ...cell, textAlign: "right", verticalAlign: "middle" }}>
              <p style={{ fontSize: "2cqw" }}>{dates}</p>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
