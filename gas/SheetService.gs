var STRUCTURED_MANAGEMENT_HEADERS = [
  "export_status",
  "batch_id",
  "exported_at",
  "structure_error",
];
var EXPORT_BATCH_HEADERS = [
  "batch_id",
  "schema_version",
  "prompt_version",
  "target_count",
  "file_name",
  "drive_file_id",
  "status",
  "generated_at",
  "error_message",
];

function headerIndexes(headerRow) {
  var indexes = Object.create(null);
  headerRow.forEach(function (header, index) {
    indexes[String(header)] = index;
  });
  return indexes;
}

function requireHeaders(indexes, expected, sheetName) {
  expected.forEach(function (header) {
    if (indexes[header] === undefined) {
      throw new Error("MISSING_HEADER:" + sheetName + ":" + header);
    }
  });
}

function readStructuredTable(spreadsheet) {
  var sheet = requireGasSheet(spreadsheet, GAS_SHEET_NAMES.structuredProjects);
  var values = sheet.getDataRange().getDisplayValues();
  if (values.length === 0) throw new Error("EMPTY_SHEET:structured_projects");
  var indexes = headerIndexes(values[0]);
  requireHeaders(
    indexes,
    CSV_HEADERS.concat(STRUCTURED_MANAGEMENT_HEADERS),
    GAS_SHEET_NAMES.structuredProjects,
  );
  return { sheet: sheet, rows: values.slice(1), indexes: indexes };
}

function toBatchRow(row, indexes) {
  return {
    receptionId: String(row[indexes.reception_id]),
    lineMessageId: String(row[indexes.line_message_id]),
    receivedAt: String(row[indexes.received_at]),
    promptVersion: String(row[indexes.prompt_version]),
    csvValues: CSV_HEADERS.map(function (header) {
      return row[indexes[header]];
    }),
  };
}

function getWaitingStructuredProjects(spreadsheet) {
  var table = readStructuredTable(spreadsheet);
  return table.rows
    .filter(function (row) {
      return String(row[table.indexes.export_status]) === "WAITING";
    })
    .map(function (row) {
      return toBatchRow(row, table.indexes);
    });
}

function getStructuredProjectsByBatchId(spreadsheet, batchId) {
  var table = readStructuredTable(spreadsheet);
  return table.rows
    .filter(function (row) {
      return String(row[table.indexes.batch_id]) === batchId;
    })
    .map(function (row) {
      return toBatchRow(row, table.indexes);
    });
}

function structuredRowNumberByIdentifiers(table, target) {
  var receptionRow = null;
  var messageRow = null;
  table.rows.forEach(function (row, index) {
    if (String(row[table.indexes.reception_id]) === target.receptionId) {
      receptionRow = index + 2;
    }
    if (String(row[table.indexes.line_message_id]) === target.lineMessageId) {
      messageRow = index + 2;
    }
  });
  if (receptionRow && messageRow && receptionRow !== messageRow) {
    throw new Error("IDENTIFIER_CONFLICT");
  }
  var rowNumber = receptionRow || messageRow;
  if (!rowNumber) throw new Error("STRUCTURED_PROJECT_NOT_FOUND");
  return rowNumber;
}

function setStructuredProjectStates(spreadsheet, targets, managementValues) {
  var table = readStructuredTable(spreadsheet);
  targets.forEach(function (target) {
    var rowNumber = structuredRowNumberByIdentifiers(table, target);
    table.sheet
      .getRange(rowNumber, table.indexes.export_status + 1, 1, 4)
      .setValues([managementValues]);
  });
}

function reserveStructuredProjects(spreadsheet, batchId, targets) {
  setStructuredProjectStates(spreadsheet, targets, ["RESERVED", batchId, "", ""]);
}

function markStructuredProjectsExported(spreadsheet, batchId, targets, exportedAt) {
  setStructuredProjectStates(spreadsheet, targets, ["EXPORTED", batchId, exportedAt, ""]);
}

function restoreStructuredProjectsAfterFailure(spreadsheet, targets, message) {
  setStructuredProjectStates(spreadsheet, targets, ["WAITING", "", "", message]);
}

function readExportBatchTable(spreadsheet) {
  var sheet = requireGasSheet(spreadsheet, GAS_SHEET_NAMES.exportBatches);
  var values = sheet.getDataRange().getDisplayValues();
  if (values.length === 0) throw new Error("EMPTY_SHEET:export_batches");
  var indexes = headerIndexes(values[0]);
  requireHeaders(indexes, EXPORT_BATCH_HEADERS, GAS_SHEET_NAMES.exportBatches);
  return { sheet: sheet, rows: values.slice(1), indexes: indexes };
}

function exportBatchExists(spreadsheet, batchId) {
  var table = readExportBatchTable(spreadsheet);
  return table.rows.some(function (row) {
    return String(row[table.indexes.batch_id]) === batchId;
  });
}

function appendReservedExportBatch(spreadsheet, batch) {
  var table = readExportBatchTable(spreadsheet);
  table.sheet.appendRow([
    batch.batchId,
    batch.schemaVersion,
    batch.promptVersion,
    batch.targetCount,
    batch.fileName,
    "",
    "RESERVED",
    "",
    "",
  ]);
}

function exportBatchRowNumber(table, batchId) {
  var found = null;
  table.rows.forEach(function (row, index) {
    if (String(row[table.indexes.batch_id]) === batchId) found = index + 2;
  });
  if (!found) throw new Error("EXPORT_BATCH_NOT_FOUND");
  return found;
}

function markExportBatchCreated(spreadsheet, batchId, driveFileId, generatedAt) {
  var table = readExportBatchTable(spreadsheet);
  var rowNumber = exportBatchRowNumber(table, batchId);
  table.sheet
    .getRange(rowNumber, table.indexes.drive_file_id + 1, 1, 4)
    .setValues([[driveFileId, "CREATED", generatedAt, ""]]);
}

function markExportBatchError(spreadsheet, batchId, message) {
  var table = readExportBatchTable(spreadsheet);
  var rowNumber = exportBatchRowNumber(table, batchId);
  table.sheet
    .getRange(rowNumber, table.indexes.drive_file_id + 1, 1, 4)
    .setValues([["", "ERROR", "", message]]);
}

function getReservedExportBatches(spreadsheet) {
  var table = readExportBatchTable(spreadsheet);
  return table.rows
    .filter(function (row) {
      return String(row[table.indexes.status]) === "RESERVED";
    })
    .map(function (row) {
      return {
        batchId: String(row[table.indexes.batch_id]),
        fileName: String(row[table.indexes.file_name]),
      };
    });
}
