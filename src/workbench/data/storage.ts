// File System Access API implementation for zero-backend local saves

let dirHandle: any = null;

export async function authorizeLocalDirectory() {
  try {
    // @ts-expect-error
    dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    return true;
  } catch (error) {
    console.error("User denied directory access or API not supported.", error);
    return false;
  }
}

export function isStorageAuthorized() {
  return dirHandle !== null;
}

export async function appendToCsv(filename: string, newRow: string) {
  if (!dirHandle) {
    throw new Error("Local directory not authorized.");
  }

  try {
    const fileHandle = await dirHandle.getFileHandle(filename, { create: false });
    const file = await fileHandle.getFile();
    const contents = await file.text();

    // Ensure we add a newline if the file doesn't end with one before appending
    const updatedContents = contents.endsWith("\\n")
      ? contents + newRow
      : `${contents}\\n${newRow}`;

    const writable = await fileHandle.createWritable();
    await writable.write(updatedContents);
    await writable.close();

    return true;
  } catch (error) {
    console.error("Failed to append to CSV:", error);
    return false;
  }
}
