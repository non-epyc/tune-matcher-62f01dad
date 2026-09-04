export const ALLOWED_AUDIO_EXTENSIONS = ["mp3", "wav", "ogg", "m4a", "aac", "flac", "opus"] as const;

const ALLOWED_MIME_HINTS = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/flac",
  "audio/x-flac",
  "audio/opus",
];

export function isAudioFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if ((ALLOWED_AUDIO_EXTENSIONS as readonly string[]).includes(extension)) return true;
  return ALLOWED_MIME_HINTS.includes(file.type.toLowerCase());
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
        (file) => resolve([file]),
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

export type CollectedDrop = {
  /** Files with an accepted audio format. */
  audio: File[];
  /** Names of files that were skipped because the format is not supported. */
  rejected: string[];
};

/** Split a list of files into accepted audio files and rejected names. */
export function splitAudioFiles(files: File[]): CollectedDrop {
  const audio: File[] = [];
  const rejected: string[] = [];
  for (const file of files) {
    if (isAudioFile(file)) audio.push(file);
    else rejected.push(file.name);
  }
  return { audio, rejected };
}

/** Collect files from a drop event, walking dropped folders recursively. */
export async function collectDroppedAudioFiles(dataTransfer: DataTransfer): Promise<CollectedDrop> {
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
    return splitAudioFiles(lists.flat());
  }
  return splitAudioFiles(Array.from(dataTransfer.files ?? []));
}

