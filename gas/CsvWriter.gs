var CSV_HEADERS = [
  "reception_id",
  "line_message_id",
  "line_user_id",
  "line_group_id",
  "project_name",
  "project_summary",
  "required_skills",
  "preferred_skills",
  "role",
  "process",
  "unit_price_min_man",
  "unit_price_max_man",
  "settlement_range",
  "start_month",
  "end_month",
  "work_days_per_week",
  "location",
  "nearest_station",
  "remote_style",
  "remote_note",
  "recruitment_count",
  "commercial_flow",
  "interview_count",
  "foreigner_allowed",
  "age_limit",
  "nationality_note",
  "employment_condition",
  "source_company",
  "source_contact",
  "received_at",
  "raw_text",
  "warning_codes",
  "prompt_version",
];

var UTF8_BOM = "\uFEFF";
var CSV_LINE_BREAK = "\r\n";

function escapeCsvCell(value) {
  var text = value === null || value === undefined ? "" : String(value);
  return '"' + text.replace(/"/g, '""') + '"';
}

function buildCsvRow(values) {
  return values.map(escapeCsvCell).join(",");
}

function buildCsvHeader() {
  return buildCsvRow(CSV_HEADERS);
}

function buildCsvContent(rows) {
  var lines = [buildCsvHeader()];
  rows.forEach(function (row) {
    lines.push(buildCsvRow(row));
  });
  return UTF8_BOM + lines.join(CSV_LINE_BREAK) + CSV_LINE_BREAK;
}

function utf8ByteLength(text) {
  var value = String(text);
  var bytes = 0;
  for (var index = 0; index < value.length; index += 1) {
    var code = value.charCodeAt(index);
    if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (
      code >= 0xd800 &&
      code <= 0xdbff &&
      index + 1 < value.length &&
      value.charCodeAt(index + 1) >= 0xdc00 &&
      value.charCodeAt(index + 1) <= 0xdfff
    ) {
      bytes += 4;
      index += 1;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

function csvByteLength(rows) {
  return utf8ByteLength(buildCsvContent(rows));
}
