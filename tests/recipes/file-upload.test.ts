import { beforeEach, describe, expect, it } from "bun:test";
import { createFileUpload } from "../../registry/recipes/file-upload/file-upload.js";

function setup(attrs = "", inputAttrs = "multiple") {
  document.body.innerHTML = `
    <div data-ui="file-upload" data-state="idle" ${attrs}>
      <label data-part="dropzone">
        <input data-part="input" type="file" ${inputAttrs}
               aria-describedby="upload-help">
        <span data-part="prompt">Choose files or drag them here</span>
        <span data-part="description" id="upload-help">File requirements.</span>
      </label>
      <ul data-part="list" aria-label="Selected files">
        <li data-part="empty">No files selected</li>
      </ul>
      <span data-part="status" role="status" aria-live="polite"></span>
    </div>`;

  const root = document.querySelector("[data-ui='file-upload']") as HTMLElement;
  const dropzone = root.querySelector("[data-part='dropzone']") as HTMLLabelElement;
  const input = root.querySelector("[data-part='input']") as HTMLInputElement;
  const api = createFileUpload(root);
  return { root, dropzone, input, api };
}

function transfer(...files: File[]) {
  const data = new DataTransfer();
  for (const file of files) data.items.add(file);
  return data;
}

function drag(target: EventTarget, type: string, data = new DataTransfer()) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    configurable: true,
    value: data,
  });
  target.dispatchEvent(event);
  return event;
}

function change(input: HTMLInputElement, data: DataTransfer) {
  input.files = data.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function names(files: FileList) {
  return Array.from(files, (file) => file.name);
}

describe("file-upload · drop and drag state", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("emits accepted files as real FileList payloads after a drop", () => {
    const { root, dropzone } = setup();
    const batches: CustomEvent[] = [];
    root.addEventListener("faqir:files", (event) => {
      batches.push(event as CustomEvent);
    });

    const first = new File(["alpha"], "alpha.txt", { type: "text/plain" });
    const second = new File(["beta"], "beta.json", { type: "application/json" });
    const event = drag(dropzone, "drop", transfer(first, second));

    expect(event.defaultPrevented).toBe(true);
    expect(batches).toHaveLength(1);
    expect(batches[0].detail.source).toBe("drop");
    expect(batches[0].detail.files).toBeInstanceOf(FileList);
    expect(batches[0].detail.allFiles).toBeInstanceOf(FileList);
    expect(names(batches[0].detail.files)).toEqual(["alpha.txt", "beta.json"]);
    expect(names(batches[0].detail.allFiles)).toEqual(["alpha.txt", "beta.json"]);
    expect(root.dataset.state).toBe("has-files");
    expect(root.querySelectorAll("[data-part='file']")).toHaveLength(2);
  });

  it("moves through dragging, idle, and has-files root states", () => {
    const { root, dropzone } = setup();

    const over = drag(dropzone, "dragover");
    expect(over.defaultPrevented).toBe(true);
    expect(root.dataset.state).toBe("dragging");

    drag(dropzone, "dragleave");
    expect(root.dataset.state).toBe("idle");

    drag(
      dropzone,
      "drop",
      transfer(new File(["x"], "x.txt", { type: "text/plain" })),
    );
    expect(root.dataset.state).toBe("has-files");

    drag(dropzone, "dragover");
    drag(dropzone, "dragleave");
    expect(root.dataset.state).toBe("has-files");
  });
});

describe("file-upload · validation", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("emits one rejection per invalid file with accept and max-size reasons", () => {
    const { root, dropzone } = setup(
      'data-max-size="5"',
      'multiple accept="image/png"',
    );
    const rejected: CustomEvent[] = [];
    let accepted: FileList | null = null;
    root.addEventListener("faqir:file-reject", (event) => {
      rejected.push(event as CustomEvent);
    });
    root.addEventListener("faqir:files", (event) => {
      accepted = (event as CustomEvent).detail.files;
    });

    const valid = new File(["1234"], "valid.png", { type: "image/png" });
    const wrongType = new File(["12"], "notes.txt", { type: "text/plain" });
    const tooLarge = new File(["123456"], "large.png", { type: "image/png" });
    drag(dropzone, "drop", transfer(valid, wrongType, tooLarge));

    expect(rejected).toHaveLength(2);
    expect(rejected.map((event) => [event.detail.file.name, event.detail.reason])).toEqual([
      ["notes.txt", "accept"],
      ["large.png", "max-size"],
    ]);
    expect(rejected[0].detail.accept).toBe("image/png");
    expect(rejected[1].detail.maxSize).toBe(5);
    expect(names(accepted!)).toEqual(["valid.png"]);
    expect(root.querySelectorAll("[data-part='file']")).toHaveLength(1);
  });

  it("supports case-insensitive extensions and MIME wildcards", () => {
    const { root, dropzone } = setup(
      "",
      'multiple accept=".pdf,image/*"',
    );
    const rejected: File[] = [];
    root.addEventListener("faqir:file-reject", (event) => {
      rejected.push((event as CustomEvent).detail.file);
    });

    drag(
      dropzone,
      "drop",
      transfer(
        new File(["pdf"], "REPORT.PDF", { type: "application/octet-stream" }),
        new File(["image"], "photo.webp", { type: "image/webp" }),
        new File(["text"], "notes.txt", { type: "text/plain" }),
      ),
    );

    expect(rejected.map((file) => file.name)).toEqual(["notes.txt"]);
    expect(names((root as any)._faqirFileUpload.getFiles())).toEqual([
      "REPORT.PDF",
      "photo.webp",
    ]);
  });
});

describe("file-upload · native input fallback", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("processes input change through the same FileList event path as drop", () => {
    const { root, input } = setup();
    const batches: CustomEvent[] = [];
    root.addEventListener("faqir:files", (event) => {
      batches.push(event as CustomEvent);
    });

    const picked = new File(["picked"], "picked.txt", { type: "text/plain" });
    change(input, transfer(picked));

    expect(batches).toHaveLength(1);
    expect(batches[0].detail.source).toBe("input");
    expect(batches[0].detail.files).toBeInstanceOf(FileList);
    expect(names(batches[0].detail.files)).toEqual(["picked.txt"]);
    expect(names(batches[0].detail.allFiles)).toEqual(["picked.txt"]);
    expect(root.dataset.state).toBe("has-files");
  });

  it("keeps a real focusable input and uses native label/click activation", () => {
    const { dropzone, input, api } = setup();
    let clicks = 0;
    input.addEventListener("click", () => clicks++);

    expect(input.type).toBe("file");
    expect(input.hidden).toBe(false);
    expect(input.tabIndex).toBe(0);

    dropzone.click();
    expect(clicks).toBe(1);

    api.open();
    expect(clicks).toBe(2);
  });
});

describe("file-upload · removal and lifecycle", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("remove-from-list updates the rows and emits the remaining FileList", () => {
    const { root, dropzone, api } = setup();
    const first = new File(["a"], "first.txt", { type: "text/plain" });
    const second = new File(["b"], "second.txt", { type: "text/plain" });
    drag(dropzone, "drop", transfer(first, second));

    let removal: CustomEvent | null = null;
    root.addEventListener("faqir:file-remove", (event) => {
      removal = event as CustomEvent;
    });
    const button = root.querySelector("[data-part='remove']") as HTMLButtonElement;
    button.click();

    expect(removal!.detail.file).toBe(first);
    expect(removal!.detail.index).toBe(0);
    expect(removal!.detail.files).toBeInstanceOf(FileList);
    expect(names(removal!.detail.files)).toEqual(["second.txt"]);
    expect(names(api.getFiles())).toEqual(["second.txt"]);
    expect(root.querySelectorAll("[data-part='file']")).toHaveLength(1);

    (root.querySelector("[data-part='remove']") as HTMLButtonElement).click();
    expect(root.dataset.state).toBe("idle");
    expect(root.querySelector("[data-part='empty']")?.textContent).toBe("No files selected");
  });

  it("is idempotent and destroy removes every input/drag listener", () => {
    const { root, dropzone, input, api } = setup();
    expect(createFileUpload(root)).toBe(api);

    api.destroy();
    const dropped = drag(
      dropzone,
      "drop",
      transfer(new File(["x"], "drop.txt", { type: "text/plain" })),
    );
    change(
      input,
      transfer(new File(["x"], "input.txt", { type: "text/plain" })),
    );

    expect(dropped.defaultPrevented).toBe(false);
    expect(root.querySelectorAll("[data-part='file']")).toHaveLength(0);
    expect((root as any)._faqirFileUpload).toBeUndefined();
  });

  it("does not remove files while disabled", () => {
    const { root, dropzone, api } = setup();
    drag(
      dropzone,
      "drop",
      transfer(new File(["x"], "kept.txt", { type: "text/plain" })),
    );
    root.setAttribute("data-disabled", "");

    expect(api.remove(0)).toBe(false);
    expect(api.clear()).toBe(false);
    expect(names(api.getFiles())).toEqual(["kept.txt"]);
  });
});
