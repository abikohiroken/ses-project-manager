var DEFAULT_MAX_CSV_ROWS = 1000;
var DEFAULT_MAX_CSV_BYTES = 9 * 1024 * 1024;
var CSV_SCHEMA_VERSION = "v1";

function padNumber(value, width) {
  return String(value).padStart(width, "0");
}

function jstDateTimeParts(now) {
  var timestamp = now.getTime() + 9 * 60 * 60 * 1000;
  var millisecondsPerDay = 24 * 60 * 60 * 1000;
  var epochDay = Math.floor(timestamp / millisecondsPerDay);
  var timeInDay = timestamp - epochDay * millisecondsPerDay;

  var shiftedDay = epochDay + 719468;
  var era = Math.floor(shiftedDay / 146097);
  var dayOfEra = shiftedDay - era * 146097;
  var yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36524) -
      Math.floor(dayOfEra / 146096)) /
      365,
  );
  var year = yearOfEra + era * 400;
  var dayOfYear =
    dayOfEra -
    (365 * yearOfEra +
      Math.floor(yearOfEra / 4) -
      Math.floor(yearOfEra / 100));
  var monthPart = Math.floor((5 * dayOfYear + 2) / 153);
  var day = dayOfYear - Math.floor((153 * monthPart + 2) / 5) + 1;
  var month = monthPart + (monthPart < 10 ? 3 : -9);
  year += month <= 2 ? 1 : 0;

  var hour = Math.floor(timeInDay / (60 * 60 * 1000));
  var minute = Math.floor((timeInDay % (60 * 60 * 1000)) / (60 * 1000));
  var second = Math.floor((timeInDay % (60 * 1000)) / 1000);
  return { year: year, month: month, day: day, hour: hour, minute: minute, second: second };
}

function buildBatchId(now, randomSuffix) {
  if (!now || typeof now.getTime !== "function" || !Number.isFinite(now.getTime())) {
    throw new Error("INVALID_BATCH_TIME");
  }
  var suffix = String(randomSuffix).toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(suffix)) {
    throw new Error("INVALID_BATCH_SUFFIX");
  }
  var parts = jstDateTimeParts(now);
  return (
    "BATCH-" +
    padNumber(parts.year, 4) +
    padNumber(parts.month, 2) +
    padNumber(parts.day, 2) +
    "-" +
    padNumber(parts.hour, 2) +
    padNumber(parts.minute, 2) +
    padNumber(parts.second, 2) +
    "-" +
    suffix
  );
}

function buildCsvFileName(schemaVersion, batchId) {
  return "ses_projects_" + schemaVersion + "_" + batchId + ".csv";
}

function splitRowsIntoBatches(rows, maximumRows, maximumBytes) {
  if (rows.length === 0) return [];

  var rowLimit = maximumRows === undefined ? DEFAULT_MAX_CSV_ROWS : maximumRows;
  var byteLimit = maximumBytes === undefined ? DEFAULT_MAX_CSV_BYTES : maximumBytes;
  var sorted = rows.slice().sort(function (left, right) {
    return String(left.receivedAt).localeCompare(String(right.receivedAt));
  });
  var grouped = Object.create(null);
  var promptVersions = [];

  sorted.forEach(function (row) {
    var promptVersion = String(row.promptVersion);
    if (!grouped[promptVersion]) {
      grouped[promptVersion] = [];
      promptVersions.push(promptVersion);
    }
    grouped[promptVersion].push(row);
  });

  var headerBytes = utf8ByteLength(UTF8_BOM + buildCsvHeader() + CSV_LINE_BREAK);
  var batches = [];
  promptVersions.forEach(function (promptVersion) {
    var currentRows = [];
    var currentBytes = headerBytes;

    grouped[promptVersion].forEach(function (row) {
      var rowBytes = utf8ByteLength(buildCsvRow(row.csvValues) + CSV_LINE_BREAK);
      var exceedsRows = currentRows.length >= rowLimit;
      var exceedsBytes = currentRows.length > 0 && currentBytes + rowBytes > byteLimit;
      if (exceedsRows || exceedsBytes) {
        batches.push({ promptVersion: promptVersion, rows: currentRows });
        currentRows = [];
        currentBytes = headerBytes;
      }
      currentRows.push(row);
      currentBytes += rowBytes;
    });

    if (currentRows.length > 0) {
      batches.push({ promptVersion: promptVersion, rows: currentRows });
    }
  });
  return batches;
}
