function nextUniqueBatchId(spreadsheet, now, usedBatchIds) {
  while (true) {
    var suffix = Utilities.getUuid().replace(/-/g, "").toUpperCase().slice(0, 6);
    var batchId = buildBatchId(now, suffix);
    if (!usedBatchIds[batchId] && !exportBatchExists(spreadsheet, batchId)) {
      usedBatchIds[batchId] = true;
      return batchId;
    }
  }
}

function recoverReservedExportBatches(config) {
  getReservedExportBatches(config.spreadsheet).forEach(function (reservedBatch) {
    var targets = getStructuredProjectsByBatchId(
      config.spreadsheet,
      reservedBatch.batchId,
    );
    var file = findExistingBatchFile(config.inboxFolderId, reservedBatch.batchId);
    if (file) {
      var recoveredAt = new Date();
      markStructuredProjectsExported(
        config.spreadsheet,
        reservedBatch.batchId,
        targets,
        recoveredAt,
      );
      markExportBatchCreated(
        config.spreadsheet,
        reservedBatch.batchId,
        file.getId(),
        recoveredAt,
      );
      logGasEvent("gas_batch_recovered", {
        batch_id: reservedBatch.batchId,
        status: "CREATED",
      });
      return;
    }

    var message = "RESERVED_BATCH_FILE_NOT_FOUND";
    restoreStructuredProjectsAfterFailure(config.spreadsheet, targets, message);
    markExportBatchError(config.spreadsheet, reservedBatch.batchId, message);
    logGasEvent("gas_batch_recovered", {
      batch_id: reservedBatch.batchId,
      status: "ERROR",
    });
  });
}

function exportBatchToCsv(config, batch, usedBatchIds) {
  var now = new Date();
  var batchId = nextUniqueBatchId(config.spreadsheet, now, usedBatchIds);
  var fileName = buildCsvFileName(config.schemaVersion, batchId);
  var batchRecorded = false;
  var driveFile = null;

  try {
    reserveStructuredProjects(config.spreadsheet, batchId, batch.rows);
    appendReservedExportBatch(config.spreadsheet, {
      batchId: batchId,
      schemaVersion: config.schemaVersion,
      promptVersion: batch.promptVersion,
      targetCount: batch.rows.length,
      fileName: fileName,
    });
    batchRecorded = true;

    driveFile = findExistingBatchFile(config.inboxFolderId, batchId);
    if (!driveFile) {
      var csvContent = buildCsvContent(
        batch.rows.map(function (row) {
          return row.csvValues;
        }),
      );
      driveFile = createCsvInInbox(config.inboxFolderId, fileName, csvContent);
    }

    var generatedAt = new Date();
    markStructuredProjectsExported(
      config.spreadsheet,
      batchId,
      batch.rows,
      generatedAt,
    );
    markExportBatchCreated(
      config.spreadsheet,
      batchId,
      driveFile.getId(),
      generatedAt,
    );
    logGasEvent("gas_batch_exported", {
      batch_id: batchId,
      target_count: batch.rows.length,
      status: "CREATED",
    });
  } catch (error) {
    var message = gasErrorMessage(error);
    if (driveFile) {
      logGasEvent("gas_batch_exported", {
        batch_id: batchId,
        status: "REPAIR_PENDING",
      });
      return;
    }

    restoreStructuredProjectsAfterFailure(config.spreadsheet, batch.rows, message);
    if (batchRecorded) {
      markExportBatchError(config.spreadsheet, batchId, message);
    }
    logGasEvent("gas_batch_exported", {
      batch_id: batchId,
      status: "ERROR",
    });
  }
}

function exportWaitingProjectsToCsv() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var config = loadGasConfig();
    recoverReservedExportBatches(config);
    var waitingRows = getWaitingStructuredProjects(config.spreadsheet);
    var batches = splitRowsIntoBatches(
      waitingRows,
      config.maximumRows,
      config.maximumBytes,
    );
    var usedBatchIds = Object.create(null);
    batches.forEach(function (batch) {
      exportBatchToCsv(config, batch, usedBatchIds);
    });
  } finally {
    try {
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }
  }
}
