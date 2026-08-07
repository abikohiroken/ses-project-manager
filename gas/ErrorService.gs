function gasErrorMessage(error) {
  if (error && error.message) return String(error.message).slice(0, 500);
  return "UNKNOWN_GAS_ERROR";
}

function logGasEvent(event, fields) {
  var output = { event: event };
  Object.keys(fields || {}).forEach(function (key) {
    output[key] = fields[key];
  });
  Logger.log(JSON.stringify(output));
}
