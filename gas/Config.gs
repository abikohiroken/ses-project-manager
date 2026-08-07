var GAS_SHEET_NAMES = {
  structuredProjects: "structured_projects",
  exportBatches: "export_batches",
  settings: "settings",
};

function requireGasSetting(settings, key) {
  var value = settings[key];
  if (!value) throw new Error("MISSING_SETTING:" + key);
  return value;
}

function readSystemSettings(spreadsheet) {
  var sheet = spreadsheet.getSheetByName(GAS_SHEET_NAMES.settings);
  if (!sheet) throw new Error("MISSING_SHEET:settings");
  var lastRow = sheet.getLastRow();
  if (lastRow === 0) return {};
  var rows = sheet.getRange(1, 8, lastRow, 2).getDisplayValues();
  var settings = {};
  rows.forEach(function (row) {
    var key = String(row[0]);
    if (key) settings[key] = String(row[1]);
  });
  return settings;
}

function loadGasConfig() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error("SPREADSHEET_UNAVAILABLE");
  var settings = readSystemSettings(spreadsheet);
  var maximumRows = Number(requireGasSetting(settings, "MAX_CSV_ROWS"));
  if (!Number.isInteger(maximumRows) || maximumRows < 1 || maximumRows > 1000) {
    throw new Error("INVALID_SETTING:MAX_CSV_ROWS");
  }
  var schemaVersion = requireGasSetting(settings, "CSV_SCHEMA_VERSION");
  if (!/^v[1-9][0-9]*$/.test(schemaVersion)) {
    throw new Error("INVALID_SETTING:CSV_SCHEMA_VERSION");
  }
  return {
    spreadsheet: spreadsheet,
    schemaVersion: schemaVersion,
    inboxFolderId: requireGasSetting(settings, "CSV_INBOX_FOLDER_ID"),
    maximumRows: maximumRows,
    maximumBytes: DEFAULT_MAX_CSV_BYTES,
  };
}

function requireGasSheet(spreadsheet, name) {
  var sheet = spreadsheet.getSheetByName(name);
  if (!sheet) throw new Error("MISSING_SHEET:" + name);
  return sheet;
}
