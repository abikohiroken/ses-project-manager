function siblingFolder(parent, name) {
  var folders = parent.getFoldersByName(name);
  if (!folders.hasNext()) throw new Error("MISSING_DRIVE_FOLDER:" + name);
  return folders.next();
}

function approvedCsvFolders(inboxFolderId) {
  var inbox = DriveApp.getFolderById(inboxFolderId);
  var parents = inbox.getParents();
  if (!parents.hasNext()) throw new Error("MISSING_DRIVE_ROOT");
  var root = parents.next();
  return [inbox, siblingFolder(root, "processed"), siblingFolder(root, "error")];
}

function findExistingBatchFile(inboxFolderId, batchId) {
  var suffix = "_" + batchId + ".csv";
  var folders = approvedCsvFolders(inboxFolderId);
  for (var folderIndex = 0; folderIndex < folders.length; folderIndex += 1) {
    var files = folders[folderIndex].getFiles();
    while (files.hasNext()) {
      var file = files.next();
      if (file.getName().endsWith(suffix)) return file;
    }
  }
  return null;
}

function createCsvInInbox(inboxFolderId, fileName, content) {
  var inbox = DriveApp.getFolderById(inboxFolderId);
  var blob = Utilities.newBlob(content, "text/csv", fileName);
  return inbox.createFile(blob);
}
