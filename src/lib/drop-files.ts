const AUDIO_EXTENSIONS = ["mp3", "wav", "ogg", "m4a", "aac", "flac", "webm", "opus"];

export function isAudioFile(file: File) {
  if (file.type.startsWith("audio/")) return true;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return AUDIO_EXTENSIONS.includes(extension);
}

type FileSystemEntryLike = {
  isFile: boolean;
  isDirectory: boolean;
  file: (cb: (file: File) => void, err?: (e: unknown) => void) => void;
  createReader: () => {
    readEntries: (cb: (entries: FileSystemEntryLike[]) => void, err?: (e: unknown) => void) => void;
  };
};

function readEntry(entry: FileSystemEntryLike): Promise<File[]> {
  if (entry.isFile) {
    return new Promise((resolve) => {
      entry.file(
        (file) => resolve(isAudioFile(file) ? [file] : []),
        () => resolve([]),
      );
    });
  }
  if (!entry.isDirectory) return Promise.resolve([]);

  const reader = entry.createReader();
  return new Promise((resolve) => {
    const collected: FileSystemEntryLike[] = [];
    const readBatch = () => {
      reader.readEntries(
        (entries) => {
          if (entries.length === 0) {
            void Promise.all(collected.map(readEntry)).then((lists) => resolve(lists.flat()));
            return;
          }
          collected.push(...entries);
          readBatch();
        },
        () => resolve([]),
      );
    };
    readBatch();
  });
}

/** Collect audio files from a drop event, walking dropped folders recursively. */
export async function collectDroppedAudioFiles(dataTransfer: DataTransfer): Promise<File[]> {
  const items = Array.from(dataTransfer.items ?? []);
  const entries = items
    .map((item) =>
      "webkitGetAsEntry" in item
        ? (item.webkitGetAsEntry() as unknown as FileSystemEntryLike | null)
        : null,
    )
    .filter((entry): entry is FileSystemEntryLike => Boolean(entry));

  if (entries.length > 0) {
    const lists = await Promise.all(entries.map(readEntry));
    return lists.flat();
  }
  return Array.from(dataTransfer.files ?? []).filter(isAudioFile);
}
