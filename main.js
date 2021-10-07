class DenoStdInternalError extends Error {
    constructor(message){
        super(message);
        this.name = "DenoStdInternalError";
    }
}
function assert(expr, msg = "") {
    if (!expr) {
        throw new DenoStdInternalError(msg);
    }
}
function copy(src, dst, off = 0) {
    off = Math.max(0, Math.min(off, dst.byteLength));
    const dstBytesAvailable = dst.byteLength - off;
    if (src.byteLength > dstBytesAvailable) {
        src = src.subarray(0, dstBytesAvailable);
    }
    dst.set(src, off);
    return src.byteLength;
}
const MIN_READ = 32 * 1024;
const MAX_SIZE = 2 ** 32 - 2;
class Buffer {
    #buf;
    #off = 0;
    constructor(ab){
        this.#buf = ab === undefined ? new Uint8Array(0) : new Uint8Array(ab);
    }
    bytes(options = {
        copy: true
    }) {
        if (options.copy === false) return this.#buf.subarray(this.#off);
        return this.#buf.slice(this.#off);
    }
    empty() {
        return this.#buf.byteLength <= this.#off;
    }
    get length() {
        return this.#buf.byteLength - this.#off;
    }
    get capacity() {
        return this.#buf.buffer.byteLength;
    }
    truncate(n) {
        if (n === 0) {
            this.reset();
            return;
        }
        if (n < 0 || n > this.length) {
            throw Error("bytes.Buffer: truncation out of range");
        }
        this.#reslice(this.#off + n);
    }
    reset() {
        this.#reslice(0);
        this.#off = 0;
    }
     #tryGrowByReslice(n) {
        const l = this.#buf.byteLength;
        if (n <= this.capacity - l) {
            this.#reslice(l + n);
            return l;
        }
        return -1;
    }
     #reslice(len) {
        assert(len <= this.#buf.buffer.byteLength);
        this.#buf = new Uint8Array(this.#buf.buffer, 0, len);
    }
    readSync(p) {
        if (this.empty()) {
            this.reset();
            if (p.byteLength === 0) {
                return 0;
            }
            return null;
        }
        const nread = copy(this.#buf.subarray(this.#off), p);
        this.#off += nread;
        return nread;
    }
    read(p) {
        const rr = this.readSync(p);
        return Promise.resolve(rr);
    }
    writeSync(p) {
        const m = this.#grow(p.byteLength);
        return copy(p, this.#buf, m);
    }
    write(p) {
        const n = this.writeSync(p);
        return Promise.resolve(n);
    }
     #grow(n) {
        const m = this.length;
        if (m === 0 && this.#off !== 0) {
            this.reset();
        }
        const i = this.#tryGrowByReslice(n);
        if (i >= 0) {
            return i;
        }
        const c = this.capacity;
        if (n <= Math.floor(c / 2) - m) {
            copy(this.#buf.subarray(this.#off), this.#buf);
        } else if (c + n > MAX_SIZE) {
            throw new Error("The buffer cannot be grown beyond the maximum size.");
        } else {
            const buf = new Uint8Array(Math.min(2 * c + n, MAX_SIZE));
            copy(this.#buf.subarray(this.#off), buf);
            this.#buf = buf;
        }
        this.#off = 0;
        this.#reslice(Math.min(m + n, MAX_SIZE));
        return m;
    }
    grow(n) {
        if (n < 0) {
            throw Error("Buffer.grow: negative count");
        }
        const m = this.#grow(n);
        this.#reslice(m);
    }
    async readFrom(r) {
        let n = 0;
        const tmp = new Uint8Array(MIN_READ);
        while(true){
            const shouldGrow = this.capacity - this.length < MIN_READ;
            const buf = shouldGrow ? tmp : new Uint8Array(this.#buf.buffer, this.length);
            const nread = await r.read(buf);
            if (nread === null) {
                return n;
            }
            if (shouldGrow) this.writeSync(buf.subarray(0, nread));
            else this.#reslice(this.length + nread);
            n += nread;
        }
    }
    readFromSync(r) {
        let n = 0;
        const tmp = new Uint8Array(MIN_READ);
        while(true){
            const shouldGrow = this.capacity - this.length < MIN_READ;
            const buf = shouldGrow ? tmp : new Uint8Array(this.#buf.buffer, this.length);
            const nread = r.readSync(buf);
            if (nread === null) {
                return n;
            }
            if (shouldGrow) this.writeSync(buf.subarray(0, nread));
            else this.#reslice(this.length + nread);
            n += nread;
        }
    }
}
class StringReader extends Buffer {
    constructor(s){
        super(new TextEncoder().encode(s).buffer);
    }
}
class MultiReader {
    readers;
    currentIndex = 0;
    constructor(...readers1){
        this.readers = readers1;
    }
    async read(p) {
        const r = this.readers[this.currentIndex];
        if (!r) return null;
        const result = await r.read(p);
        if (result === null) {
            this.currentIndex++;
            return 0;
        }
        return result;
    }
}
class LimitedReader {
    reader;
    limit;
    constructor(reader1, limit1){
        this.reader = reader1;
        this.limit = limit1;
    }
    async read(p) {
        if (this.limit <= 0) {
            return null;
        }
        if (p.length > this.limit) {
            p = p.subarray(0, this.limit);
        }
        const n = await this.reader.read(p);
        if (n == null) {
            return null;
        }
        this.limit -= n;
        return n;
    }
}
const ANSI_PATTERN = new RegExp([
    "[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)",
    "(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))", 
].join("|"), "g");
var DiffType;
(function(DiffType) {
    DiffType["removed"] = "removed";
    DiffType["common"] = "common";
    DiffType["added"] = "added";
})(DiffType || (DiffType = {
}));
class AssertionError extends Error {
    name = "AssertionError";
    constructor(message1){
        super(message1);
    }
}
function unreachable() {
    throw new AssertionError("unreachable");
}
const DEFAULT_BUFFER_SIZE = 32 * 1024;
async function readAll(r) {
    const buf = new Buffer();
    await buf.readFrom(r);
    return buf.bytes();
}
async function writeAll(w, arr) {
    let nwritten = 0;
    while(nwritten < arr.length){
        nwritten += await w.write(arr.subarray(nwritten));
    }
}
function writeAllSync(w, arr) {
    let nwritten = 0;
    while(nwritten < arr.length){
        nwritten += w.writeSync(arr.subarray(nwritten));
    }
}
async function copy1(src, dst, options) {
    let n = 0;
    const bufSize = options?.bufSize ?? DEFAULT_BUFFER_SIZE;
    const b = new Uint8Array(bufSize);
    let gotEOF = false;
    while(gotEOF === false){
        const result = await src.read(b);
        if (result === null) {
            gotEOF = true;
        } else {
            let nwritten = 0;
            while(nwritten < result){
                nwritten += await dst.write(b.subarray(nwritten, result));
            }
            n += nwritten;
        }
    }
    return n;
}
const DEFAULT_BUF_SIZE = 4096;
const MIN_BUF_SIZE = 16;
const CR = "\r".charCodeAt(0);
const LF = "\n".charCodeAt(0);
class BufferFullError extends Error {
    partial;
    name = "BufferFullError";
    constructor(partial1){
        super("Buffer full");
        this.partial = partial1;
    }
}
class PartialReadError extends Error {
    name = "PartialReadError";
    partial;
    constructor(){
        super("Encountered UnexpectedEof, data only partially read");
    }
}
class BufReader {
    buf;
    rd;
    r = 0;
    w = 0;
    eof = false;
    static create(r, size = 4096) {
        return r instanceof BufReader ? r : new BufReader(r, size);
    }
    constructor(rd1, size = 4096){
        if (size < 16) {
            size = MIN_BUF_SIZE;
        }
        this._reset(new Uint8Array(size), rd1);
    }
    size() {
        return this.buf.byteLength;
    }
    buffered() {
        return this.w - this.r;
    }
    async _fill() {
        if (this.r > 0) {
            this.buf.copyWithin(0, this.r, this.w);
            this.w -= this.r;
            this.r = 0;
        }
        if (this.w >= this.buf.byteLength) {
            throw Error("bufio: tried to fill full buffer");
        }
        for(let i = 100; i > 0; i--){
            const rr = await this.rd.read(this.buf.subarray(this.w));
            if (rr === null) {
                this.eof = true;
                return;
            }
            assert(rr >= 0, "negative read");
            this.w += rr;
            if (rr > 0) {
                return;
            }
        }
        throw new Error(`No progress after ${100} read() calls`);
    }
    reset(r) {
        this._reset(this.buf, r);
    }
    _reset(buf, rd) {
        this.buf = buf;
        this.rd = rd;
        this.eof = false;
    }
    async read(p) {
        let rr = p.byteLength;
        if (p.byteLength === 0) return rr;
        if (this.r === this.w) {
            if (p.byteLength >= this.buf.byteLength) {
                const rr = await this.rd.read(p);
                const nread = rr ?? 0;
                assert(nread >= 0, "negative read");
                return rr;
            }
            this.r = 0;
            this.w = 0;
            rr = await this.rd.read(this.buf);
            if (rr === 0 || rr === null) return rr;
            assert(rr >= 0, "negative read");
            this.w += rr;
        }
        const copied = copy(this.buf.subarray(this.r, this.w), p, 0);
        this.r += copied;
        return copied;
    }
    async readFull(p) {
        let bytesRead = 0;
        while(bytesRead < p.length){
            try {
                const rr = await this.read(p.subarray(bytesRead));
                if (rr === null) {
                    if (bytesRead === 0) {
                        return null;
                    } else {
                        throw new PartialReadError();
                    }
                }
                bytesRead += rr;
            } catch (err) {
                if (err instanceof PartialReadError) {
                    err.partial = p.subarray(0, bytesRead);
                } else if (err instanceof Error) {
                    const e = new PartialReadError();
                    e.partial = p.subarray(0, bytesRead);
                    e.stack = err.stack;
                    e.message = err.message;
                    e.cause = err.cause;
                    throw err;
                }
                throw err;
            }
        }
        return p;
    }
    async readByte() {
        while(this.r === this.w){
            if (this.eof) return null;
            await this._fill();
        }
        const c = this.buf[this.r];
        this.r++;
        return c;
    }
    async readString(delim) {
        if (delim.length !== 1) {
            throw new Error("Delimiter should be a single character");
        }
        const buffer = await this.readSlice(delim.charCodeAt(0));
        if (buffer === null) return null;
        return new TextDecoder().decode(buffer);
    }
    async readLine() {
        let line = null;
        try {
            line = await this.readSlice(LF);
        } catch (err) {
            if (err instanceof Deno.errors.BadResource) {
                throw err;
            }
            let partial;
            if (err instanceof PartialReadError) {
                partial = err.partial;
                assert(partial instanceof Uint8Array, "bufio: caught error from `readSlice()` without `partial` property");
            }
            if (!(err instanceof BufferFullError)) {
                throw err;
            }
            if (!this.eof && partial && partial.byteLength > 0 && partial[partial.byteLength - 1] === CR) {
                assert(this.r > 0, "bufio: tried to rewind past start of buffer");
                this.r--;
                partial = partial.subarray(0, partial.byteLength - 1);
            }
            if (partial) {
                return {
                    line: partial,
                    more: !this.eof
                };
            }
        }
        if (line === null) {
            return null;
        }
        if (line.byteLength === 0) {
            return {
                line,
                more: false
            };
        }
        if (line[line.byteLength - 1] == LF) {
            let drop = 1;
            if (line.byteLength > 1 && line[line.byteLength - 2] === CR) {
                drop = 2;
            }
            line = line.subarray(0, line.byteLength - drop);
        }
        return {
            line,
            more: false
        };
    }
    async readSlice(delim) {
        let s = 0;
        let slice;
        while(true){
            let i = this.buf.subarray(this.r + s, this.w).indexOf(delim);
            if (i >= 0) {
                i += s;
                slice = this.buf.subarray(this.r, this.r + i + 1);
                this.r += i + 1;
                break;
            }
            if (this.eof) {
                if (this.r === this.w) {
                    return null;
                }
                slice = this.buf.subarray(this.r, this.w);
                this.r = this.w;
                break;
            }
            if (this.buffered() >= this.buf.byteLength) {
                this.r = this.w;
                const oldbuf = this.buf;
                const newbuf = this.buf.slice(0);
                this.buf = newbuf;
                throw new BufferFullError(oldbuf);
            }
            s = this.w - this.r;
            try {
                await this._fill();
            } catch (err) {
                if (err instanceof PartialReadError) {
                    err.partial = slice;
                } else if (err instanceof Error) {
                    const e = new PartialReadError();
                    e.partial = slice;
                    e.stack = err.stack;
                    e.message = err.message;
                    e.cause = err.cause;
                    throw err;
                }
                throw err;
            }
        }
        return slice;
    }
    async peek(n) {
        if (n < 0) {
            throw Error("negative count");
        }
        let avail = this.w - this.r;
        while(avail < n && avail < this.buf.byteLength && !this.eof){
            try {
                await this._fill();
            } catch (err) {
                if (err instanceof PartialReadError) {
                    err.partial = this.buf.subarray(this.r, this.w);
                } else if (err instanceof Error) {
                    const e = new PartialReadError();
                    e.partial = this.buf.subarray(this.r, this.w);
                    e.stack = err.stack;
                    e.message = err.message;
                    e.cause = err.cause;
                    throw err;
                }
                throw err;
            }
            avail = this.w - this.r;
        }
        if (avail === 0 && this.eof) {
            return null;
        } else if (avail < n && this.eof) {
            return this.buf.subarray(this.r, this.r + avail);
        } else if (avail < n) {
            throw new BufferFullError(this.buf.subarray(this.r, this.w));
        }
        return this.buf.subarray(this.r, this.r + n);
    }
}
class AbstractBufBase {
    buf;
    usedBufferBytes = 0;
    err = null;
    size() {
        return this.buf.byteLength;
    }
    available() {
        return this.buf.byteLength - this.usedBufferBytes;
    }
    buffered() {
        return this.usedBufferBytes;
    }
}
class BufWriter extends AbstractBufBase {
    writer;
    static create(writer, size = 4096) {
        return writer instanceof BufWriter ? writer : new BufWriter(writer, size);
    }
    constructor(writer1, size1 = 4096){
        super();
        this.writer = writer1;
        if (size1 <= 0) {
            size1 = DEFAULT_BUF_SIZE;
        }
        this.buf = new Uint8Array(size1);
    }
    reset(w) {
        this.err = null;
        this.usedBufferBytes = 0;
        this.writer = w;
    }
    async flush() {
        if (this.err !== null) throw this.err;
        if (this.usedBufferBytes === 0) return;
        try {
            await writeAll(this.writer, this.buf.subarray(0, this.usedBufferBytes));
        } catch (e) {
            if (e instanceof Error) {
                this.err = e;
            }
            throw e;
        }
        this.buf = new Uint8Array(this.buf.length);
        this.usedBufferBytes = 0;
    }
    async write(data) {
        if (this.err !== null) throw this.err;
        if (data.length === 0) return 0;
        let totalBytesWritten = 0;
        let numBytesWritten = 0;
        while(data.byteLength > this.available()){
            if (this.buffered() === 0) {
                try {
                    numBytesWritten = await this.writer.write(data);
                } catch (e) {
                    if (e instanceof Error) {
                        this.err = e;
                    }
                    throw e;
                }
            } else {
                numBytesWritten = copy(data, this.buf, this.usedBufferBytes);
                this.usedBufferBytes += numBytesWritten;
                await this.flush();
            }
            totalBytesWritten += numBytesWritten;
            data = data.subarray(numBytesWritten);
        }
        numBytesWritten = copy(data, this.buf, this.usedBufferBytes);
        this.usedBufferBytes += numBytesWritten;
        totalBytesWritten += numBytesWritten;
        return totalBytesWritten;
    }
}
class BufWriterSync extends AbstractBufBase {
    writer;
    static create(writer, size = 4096) {
        return writer instanceof BufWriterSync ? writer : new BufWriterSync(writer, size);
    }
    constructor(writer2, size2 = 4096){
        super();
        this.writer = writer2;
        if (size2 <= 0) {
            size2 = DEFAULT_BUF_SIZE;
        }
        this.buf = new Uint8Array(size2);
    }
    reset(w) {
        this.err = null;
        this.usedBufferBytes = 0;
        this.writer = w;
    }
    flush() {
        if (this.err !== null) throw this.err;
        if (this.usedBufferBytes === 0) return;
        try {
            writeAllSync(this.writer, this.buf.subarray(0, this.usedBufferBytes));
        } catch (e) {
            if (e instanceof Error) {
                this.err = e;
            }
            throw e;
        }
        this.buf = new Uint8Array(this.buf.length);
        this.usedBufferBytes = 0;
    }
    writeSync(data) {
        if (this.err !== null) throw this.err;
        if (data.length === 0) return 0;
        let totalBytesWritten = 0;
        let numBytesWritten = 0;
        while(data.byteLength > this.available()){
            if (this.buffered() === 0) {
                try {
                    numBytesWritten = this.writer.writeSync(data);
                } catch (e) {
                    if (e instanceof Error) {
                        this.err = e;
                    }
                    throw e;
                }
            } else {
                numBytesWritten = copy(data, this.buf, this.usedBufferBytes);
                this.usedBufferBytes += numBytesWritten;
                this.flush();
            }
            totalBytesWritten += numBytesWritten;
            data = data.subarray(numBytesWritten);
        }
        numBytesWritten = copy(data, this.buf, this.usedBufferBytes);
        this.usedBufferBytes += numBytesWritten;
        totalBytesWritten += numBytesWritten;
        return totalBytesWritten;
    }
}
const recordSize = 512;
const ustar = "ustar\u000000";
const initialChecksum = 8 * 32;
async function readBlock(reader, p) {
    let bytesRead = 0;
    while(bytesRead < p.length){
        const rr = await reader.read(p.subarray(bytesRead));
        if (rr === null) {
            if (bytesRead === 0) {
                return null;
            } else {
                throw new PartialReadError();
            }
        }
        bytesRead += rr;
    }
    return bytesRead;
}
class FileReader {
    filePath;
    file;
    constructor(filePath1){
        this.filePath = filePath1;
    }
    async read(p) {
        if (!this.file) {
            this.file = await Deno.open(this.filePath, {
                read: true
            });
        }
        const res = await Deno.read(this.file.rid, p);
        if (res === null) {
            Deno.close(this.file.rid);
            this.file = undefined;
        }
        return res;
    }
}
function trim(buffer) {
    const index = buffer.findIndex((v)=>v === 0
    );
    if (index < 0) return buffer;
    return buffer.subarray(0, index);
}
function clean(length) {
    const buffer = new Uint8Array(length);
    buffer.fill(0, 0, length - 1);
    return buffer;
}
function pad(num, bytes, base = 8) {
    const numString = num.toString(base);
    return "000000000000".substr(numString.length + 12 - bytes) + numString;
}
var FileTypes;
(function(FileTypes) {
    FileTypes[FileTypes["file"] = 0] = "file";
    FileTypes[FileTypes["link"] = 1] = "link";
    FileTypes[FileTypes["symlink"] = 2] = "symlink";
    FileTypes[FileTypes["character-device"] = 3] = "character-device";
    FileTypes[FileTypes["block-device"] = 4] = "block-device";
    FileTypes[FileTypes["directory"] = 5] = "directory";
    FileTypes[FileTypes["fifo"] = 6] = "fifo";
    FileTypes[FileTypes["contiguous-file"] = 7] = "contiguous-file";
})(FileTypes || (FileTypes = {
}));
const ustarStructure = [
    {
        field: "fileName",
        length: 100
    },
    {
        field: "fileMode",
        length: 8
    },
    {
        field: "uid",
        length: 8
    },
    {
        field: "gid",
        length: 8
    },
    {
        field: "fileSize",
        length: 12
    },
    {
        field: "mtime",
        length: 12
    },
    {
        field: "checksum",
        length: 8
    },
    {
        field: "type",
        length: 1
    },
    {
        field: "linkName",
        length: 100
    },
    {
        field: "ustar",
        length: 8
    },
    {
        field: "owner",
        length: 32
    },
    {
        field: "group",
        length: 32
    },
    {
        field: "majorNumber",
        length: 8
    },
    {
        field: "minorNumber",
        length: 8
    },
    {
        field: "fileNamePrefix",
        length: 155
    },
    {
        field: "padding",
        length: 12
    }, 
];
function formatHeader(data) {
    const encoder = new TextEncoder(), buffer = clean(512);
    let offset = 0;
    ustarStructure.forEach(function(value) {
        const entry = encoder.encode(data[value.field] || "");
        buffer.set(entry, offset);
        offset += value.length;
    });
    return buffer;
}
function parseHeader(buffer) {
    const data = {
    };
    let offset = 0;
    ustarStructure.forEach(function(value) {
        const arr = buffer.subarray(offset, offset + value.length);
        data[value.field] = arr;
        offset += value.length;
    });
    return data;
}
class Tar {
    data;
    constructor(){
        this.data = [];
    }
    async append(fn, opts) {
        if (typeof fn !== "string") {
            throw new Error("file name not specified");
        }
        let fileName = fn;
        let fileNamePrefix;
        if (fileName.length > 100) {
            let i = fileName.length;
            while(i >= 0){
                i = fileName.lastIndexOf("/", i);
                if (i <= 155) {
                    fileNamePrefix = fileName.substr(0, i);
                    fileName = fileName.substr(i + 1);
                    break;
                }
                i--;
            }
            const errMsg = "ustar format does not allow a long file name (length of [file name" + "prefix] + / + [file name] must be shorter than 256 bytes)";
            if (i < 0 || fileName.length > 100) {
                throw new Error(errMsg);
            } else {
                assert(fileNamePrefix != null);
                if (fileNamePrefix.length > 155) {
                    throw new Error(errMsg);
                }
            }
        }
        opts = opts || {
        };
        let info;
        if (opts.filePath) {
            info = await Deno.stat(opts.filePath);
            if (info.isDirectory) {
                info.size = 0;
                opts.reader = new Buffer();
            }
        }
        const mode = opts.fileMode || info && info.mode || parseInt("777", 8) & 4095, mtime = Math.floor(opts.mtime ?? (info?.mtime ?? new Date()).valueOf() / 1000), uid = opts.uid || 0, gid = opts.gid || 0;
        if (typeof opts.owner === "string" && opts.owner.length >= 32) {
            throw new Error("ustar format does not allow owner name length >= 32 bytes");
        }
        if (typeof opts.group === "string" && opts.group.length >= 32) {
            throw new Error("ustar format does not allow group name length >= 32 bytes");
        }
        const fileSize = info?.size ?? opts.contentSize;
        assert(fileSize != null, "fileSize must be set");
        const type = opts.type ? FileTypes[opts.type] : info?.isDirectory ? FileTypes.directory : FileTypes.file;
        const tarData = {
            fileName,
            fileNamePrefix,
            fileMode: pad(mode, 7),
            uid: pad(uid, 7),
            gid: pad(gid, 7),
            fileSize: pad(fileSize, 11),
            mtime: pad(mtime, 11),
            checksum: "        ",
            type: type.toString(),
            ustar,
            owner: opts.owner || "",
            group: opts.group || "",
            filePath: opts.filePath,
            reader: opts.reader
        };
        let checksum = 0;
        const encoder = new TextEncoder();
        Object.keys(tarData).filter((key)=>[
                "filePath",
                "reader"
            ].indexOf(key) < 0
        ).forEach(function(key) {
            checksum += encoder.encode(tarData[key]).reduce((p, c)=>p + c
            , 0);
        });
        tarData.checksum = pad(checksum, 6) + "\u0000 ";
        this.data.push(tarData);
    }
    getReader() {
        const readers = [];
        this.data.forEach((tarData)=>{
            let { reader  } = tarData;
            const { filePath  } = tarData;
            const headerArr = formatHeader(tarData);
            readers.push(new Buffer(headerArr));
            if (!reader) {
                assert(filePath != null);
                reader = new FileReader(filePath);
            }
            readers.push(reader);
            assert(tarData.fileSize != null, "fileSize must be set");
            readers.push(new Buffer(clean(512 - (parseInt(tarData.fileSize, 8) % 512 || 512))));
        });
        readers.push(new Buffer(clean(512 * 2)));
        return new MultiReader(...readers);
    }
}
class TarEntry {
    #header;
    #reader;
    #size;
    #read = 0;
    #consumed = false;
    #entrySize;
    constructor(meta, header1, reader2){
        Object.assign(this, meta);
        this.#header = header1;
        this.#reader = reader2;
        this.#size = this.fileSize || 0;
        const blocks = Math.ceil(this.#size / 512);
        this.#entrySize = blocks * recordSize;
    }
    get consumed() {
        return this.#consumed;
    }
    async read(p) {
        const entryBytesLeft = this.#entrySize - this.#read;
        const bufSize = Math.min(p.length, entryBytesLeft);
        if (entryBytesLeft <= 0) {
            this.#consumed = true;
            return null;
        }
        const block = new Uint8Array(bufSize);
        const n = await readBlock(this.#reader, block);
        const bytesLeft = this.#size - this.#read;
        this.#read += n || 0;
        if (n === null || bytesLeft <= 0) {
            if (n === null) this.#consumed = true;
            return null;
        }
        const offset = bytesLeft < n ? bytesLeft : n;
        p.set(block.subarray(0, offset), 0);
        return offset < 0 ? n - Math.abs(offset) : offset;
    }
    async discard() {
        if (this.#consumed) return;
        this.#consumed = true;
        if (typeof this.#reader.seek === "function") {
            await this.#reader.seek(this.#entrySize - this.#read, Deno.SeekMode.Current);
            this.#read = this.#entrySize;
        } else {
            await readAll(this);
        }
    }
}
class Untar {
    reader;
    block;
    #entry;
    constructor(reader3){
        this.reader = reader3;
        this.block = new Uint8Array(recordSize);
    }
     #checksum(header) {
        let sum = initialChecksum;
        for(let i = 0; i < 512; i++){
            if (i >= 148 && i < 156) {
                continue;
            }
            sum += header[i];
        }
        return sum;
    }
    async #getHeader() {
        await readBlock(this.reader, this.block);
        const header = parseHeader(this.block);
        const decoder = new TextDecoder();
        const checksum = this.#checksum(this.block);
        if (parseInt(decoder.decode(header.checksum), 8) !== checksum) {
            if (checksum === initialChecksum) {
                return null;
            }
            throw new Error("checksum error");
        }
        const magic = decoder.decode(header.ustar);
        if (magic.indexOf("ustar")) {
            throw new Error(`unsupported archive format: ${magic}`);
        }
        return header;
    }
     #getMetadata(header) {
        const decoder = new TextDecoder();
        const meta = {
            fileName: decoder.decode(trim(header.fileName))
        };
        const fileNamePrefix = trim(header.fileNamePrefix);
        if (fileNamePrefix.byteLength > 0) {
            meta.fileName = decoder.decode(fileNamePrefix) + "/" + meta.fileName;
        }
        [
            "fileMode",
            "mtime",
            "uid",
            "gid"
        ].forEach((key)=>{
            const arr = trim(header[key]);
            if (arr.byteLength > 0) {
                meta[key] = parseInt(decoder.decode(arr), 8);
            }
        });
        [
            "owner",
            "group",
            "type"
        ].forEach((key)=>{
            const arr = trim(header[key]);
            if (arr.byteLength > 0) {
                meta[key] = decoder.decode(arr);
            }
        });
        meta.fileSize = parseInt(decoder.decode(header.fileSize), 8);
        meta.type = FileTypes[parseInt(meta.type)] ?? meta.type;
        return meta;
    }
    async extract() {
        if (this.#entry && !this.#entry.consumed) {
            await this.#entry.discard();
        }
        const header = await this.#getHeader();
        if (header === null) return null;
        const meta = this.#getMetadata(header);
        this.#entry = new TarEntry(meta, header, this.reader);
        return this.#entry;
    }
    async *[Symbol.asyncIterator]() {
        while(true){
            const entry = await this.extract();
            if (entry === null) return;
            yield entry;
        }
    }
}
const osType = (()=>{
    const { Deno  } = globalThis;
    if (typeof Deno?.build?.os === "string") {
        return Deno.build.os;
    }
    const { navigator  } = globalThis;
    if (navigator?.appVersion?.includes?.("Win") ?? false) {
        return "windows";
    }
    return "linux";
})();
const kCustomPromisifiedSymbol = Symbol.for("nodejs.util.promisify.custom");
const kCustomPromisifyArgsSymbol = Symbol.for("nodejs.util.promisify.customArgs");
class NodeInvalidArgTypeError extends TypeError {
    code = "ERR_INVALID_ARG_TYPE";
    constructor(argumentName, type1, received){
        super(`The "${argumentName}" argument must be of type ${type1}. Received ${typeof received}`);
    }
}
function promisify(original) {
    if (typeof original !== "function") {
        throw new NodeInvalidArgTypeError("original", "Function", original);
    }
    if (original[kCustomPromisifiedSymbol]) {
        const fn = original[kCustomPromisifiedSymbol];
        if (typeof fn !== "function") {
            throw new NodeInvalidArgTypeError("util.promisify.custom", "Function", fn);
        }
        return Object.defineProperty(fn, kCustomPromisifiedSymbol, {
            value: fn,
            enumerable: false,
            writable: false,
            configurable: true
        });
    }
    const argumentNames = original[kCustomPromisifyArgsSymbol];
    function fn(...args) {
        return new Promise((resolve, reject)=>{
            original.call(this, ...args, (err, ...values)=>{
                if (err) {
                    return reject(err);
                }
                if (argumentNames !== undefined && values.length > 1) {
                    const obj = {
                    };
                    for(let i = 0; i < argumentNames.length; i++){
                        obj[argumentNames[i]] = values[i];
                    }
                    resolve(obj);
                } else {
                    resolve(values[0]);
                }
            });
        });
    }
    Object.setPrototypeOf(fn, Object.getPrototypeOf(original));
    Object.defineProperty(fn, kCustomPromisifiedSymbol, {
        value: fn,
        enumerable: false,
        writable: false,
        configurable: true
    });
    return Object.defineProperties(fn, Object.getOwnPropertyDescriptors(original));
}
promisify.custom = kCustomPromisifiedSymbol;
class NodeFalsyValueRejectionError extends Error {
    reason;
    code = "ERR_FALSY_VALUE_REJECTION";
    constructor(reason1){
        super("Promise was rejected with falsy value");
        this.reason = reason1;
    }
}
class NodeInvalidArgTypeError1 extends TypeError {
    code = "ERR_INVALID_ARG_TYPE";
    constructor(argumentName1){
        super(`The ${argumentName1} argument must be of type function.`);
    }
}
const noop = ()=>{
};
class AsyncIterableClone {
    currentPromise;
    resolveCurrent = noop;
    consumed;
    consume = noop;
    constructor(){
        this.currentPromise = new Promise((resolve)=>{
            this.resolveCurrent = resolve;
        });
        this.consumed = new Promise((resolve)=>{
            this.consume = resolve;
        });
    }
    reset() {
        this.currentPromise = new Promise((resolve)=>{
            this.resolveCurrent = resolve;
        });
        this.consumed = new Promise((resolve)=>{
            this.consume = resolve;
        });
    }
    async next() {
        const res = await this.currentPromise;
        this.consume();
        this.reset();
        return res;
    }
    async push(res) {
        this.resolveCurrent(res);
        await this.consumed;
    }
    [Symbol.asyncIterator]() {
        return this;
    }
}
class DeadlineError extends Error {
    constructor(){
        super("Deadline");
        this.name = "DeadlineError";
    }
}
const classRegExp = /^([A-Z][a-z0-9]*)+$/;
const kTypes = [
    "string",
    "function",
    "number",
    "object",
    "Function",
    "Object",
    "boolean",
    "bigint",
    "symbol", 
];
class NodeErrorAbstraction extends Error {
    code;
    constructor(name1, code1, message2){
        super(message2);
        this.code = code1;
        this.name = name1;
        this.stack = this.stack && `${name1} [${this.code}]${this.stack.slice(20)}`;
    }
    toString() {
        return `${this.name} [${this.code}]: ${this.message}`;
    }
}
class NodeError extends NodeErrorAbstraction {
    constructor(code2, message3){
        super(Error.prototype.name, code2, message3);
    }
}
class NodeSyntaxError extends NodeErrorAbstraction {
    constructor(code3, message4){
        super(SyntaxError.prototype.name, code3, message4);
        Object.setPrototypeOf(this, SyntaxError.prototype);
    }
}
class NodeRangeError extends NodeErrorAbstraction {
    constructor(code4, message5){
        super(RangeError.prototype.name, code4, message5);
        Object.setPrototypeOf(this, RangeError.prototype);
    }
}
class NodeTypeError extends NodeErrorAbstraction {
    constructor(code5, message6){
        super(TypeError.prototype.name, code5, message6);
        Object.setPrototypeOf(this, TypeError.prototype);
    }
}
class NodeURIError extends NodeErrorAbstraction {
    constructor(code6, message7){
        super(URIError.prototype.name, code6, message7);
        Object.setPrototypeOf(this, URIError.prototype);
    }
}
class ERR_INVALID_ARG_TYPE extends NodeTypeError {
    constructor(name2, expected, actual1){
        expected = Array.isArray(expected) ? expected : [
            expected
        ];
        let msg2 = "The ";
        if (name2.endsWith(" argument")) {
            msg2 += `${name2} `;
        } else {
            const type = name2.includes(".") ? "property" : "argument";
            msg2 += `"${name2}" ${type} `;
        }
        msg2 += "must be ";
        const types = [];
        const instances = [];
        const other = [];
        for (const value of expected){
            if (kTypes.includes(value)) {
                types.push(value.toLocaleLowerCase());
            } else if (classRegExp.test(value)) {
                instances.push(value);
            } else {
                other.push(value);
            }
        }
        if (instances.length > 0) {
            const pos = types.indexOf("object");
            if (pos !== -1) {
                types.splice(pos, 1);
                instances.push("Object");
            }
        }
        if (types.length > 0) {
            if (types.length > 2) {
                const last = types.pop();
                msg2 += `one of type ${types.join(", ")}, or ${last}`;
            } else if (types.length === 2) {
                msg2 += `one of type ${types[0]} or ${types[1]}`;
            } else {
                msg2 += `of type ${types[0]}`;
            }
            if (instances.length > 0 || other.length > 0) {
                msg2 += " or ";
            }
        }
        if (instances.length > 0) {
            if (instances.length > 2) {
                const last = instances.pop();
                msg2 += `an instance of ${instances.join(", ")}, or ${last}`;
            } else {
                msg2 += `an instance of ${instances[0]}`;
                if (instances.length === 2) {
                    msg2 += ` or ${instances[1]}`;
                }
            }
            if (other.length > 0) {
                msg2 += " or ";
            }
        }
        if (other.length > 0) {
            if (other.length > 2) {
                const last = other.pop();
                msg2 += `one of ${other.join(", ")}, or ${last}`;
            } else if (other.length === 2) {
                msg2 += `one of ${other[0]} or ${other[1]}`;
            } else {
                if (other[0].toLowerCase() !== other[0]) {
                    msg2 += "an ";
                }
                msg2 += `${other[0]}`;
            }
        }
        super("ERR_INVALID_ARG_TYPE", `${msg2}.${invalidArgTypeHelper(actual1)}`);
    }
}
const DEFAULT_INSPECT_OPTIONS = {
    showHidden: false,
    depth: 2,
    colors: false,
    customInspect: true,
    showProxy: false,
    maxArrayLength: 100,
    maxStringLength: Infinity,
    breakLength: 80,
    compact: 3,
    sorted: false,
    getters: false
};
inspect.defaultOptions = DEFAULT_INSPECT_OPTIONS;
inspect.custom = Symbol.for("nodejs.util.inspect.custom");
function inspect(object, ...opts) {
    if (typeof object === "string" && !object.includes("'")) {
        return `'${object}'`;
    }
    opts = {
        ...DEFAULT_INSPECT_OPTIONS,
        ...opts
    };
    return Deno.inspect(object, {
        depth: opts.depth,
        iterableLimit: opts.maxArrayLength,
        compact: !!opts.compact,
        sorted: !!opts.sorted,
        showProxy: !!opts.showProxy
    });
}
class ERR_INVALID_ARG_VALUE extends NodeTypeError {
    constructor(name3, value1, reason2){
        super("ERR_INVALID_ARG_VALUE", `The argument '${name3}' ${reason2}. Received ${inspect(value1)}`);
    }
}
function invalidArgTypeHelper(input) {
    if (input == null) {
        return ` Received ${input}`;
    }
    if (typeof input === "function" && input.name) {
        return ` Received function ${input.name}`;
    }
    if (typeof input === "object") {
        if (input.constructor && input.constructor.name) {
            return ` Received an instance of ${input.constructor.name}`;
        }
        return ` Received ${inspect(input, {
            depth: -1
        })}`;
    }
    let inspected = inspect(input, {
        colors: false
    });
    if (inspected.length > 25) {
        inspected = `${inspected.slice(0, 25)}...`;
    }
    return ` Received type ${typeof input} (${inspected})`;
}
class ERR_OUT_OF_RANGE extends RangeError {
    code = "ERR_OUT_OF_RANGE";
    constructor(str, range, received1){
        super(`The value of "${str}" is out of range. It must be ${range}. Received ${received1}`);
        const { name: name4  } = this;
        this.name = `${name4} [${this.code}]`;
        this.stack;
        this.name = name4;
    }
}
class ERR_AMBIGUOUS_ARGUMENT extends NodeTypeError {
    constructor(x, y){
        super("ERR_AMBIGUOUS_ARGUMENT", `The "${x}" argument is ambiguous. ${y}`);
    }
}
class ERR_ARG_NOT_ITERABLE extends NodeTypeError {
    constructor(x1){
        super("ERR_ARG_NOT_ITERABLE", `${x1} must be iterable`);
    }
}
class ERR_ASSERTION extends NodeError {
    constructor(x2){
        super("ERR_ASSERTION", `${x2}`);
    }
}
class ERR_ASYNC_CALLBACK extends NodeTypeError {
    constructor(x3){
        super("ERR_ASYNC_CALLBACK", `${x3} must be a function`);
    }
}
class ERR_ASYNC_TYPE extends NodeTypeError {
    constructor(x4){
        super("ERR_ASYNC_TYPE", `Invalid name for async "type": ${x4}`);
    }
}
class ERR_BROTLI_INVALID_PARAM extends NodeRangeError {
    constructor(x5){
        super("ERR_BROTLI_INVALID_PARAM", `${x5} is not a valid Brotli parameter`);
    }
}
class ERR_BUFFER_OUT_OF_BOUNDS extends NodeRangeError {
    constructor(name5){
        super("ERR_BUFFER_OUT_OF_BOUNDS", name5 ? `"${name5}" is outside of buffer bounds` : "Attempt to access memory outside buffer bounds");
    }
}
class ERR_BUFFER_TOO_LARGE extends NodeRangeError {
    constructor(x6){
        super("ERR_BUFFER_TOO_LARGE", `Cannot create a Buffer larger than ${x6} bytes`);
    }
}
class ERR_CANNOT_WATCH_SIGINT extends NodeError {
    constructor(){
        super("ERR_CANNOT_WATCH_SIGINT", "Cannot watch for SIGINT signals");
    }
}
class ERR_CHILD_CLOSED_BEFORE_REPLY extends NodeError {
    constructor(){
        super("ERR_CHILD_CLOSED_BEFORE_REPLY", "Child closed before reply received");
    }
}
class ERR_CHILD_PROCESS_IPC_REQUIRED extends NodeError {
    constructor(x7){
        super("ERR_CHILD_PROCESS_IPC_REQUIRED", `Forked processes must have an IPC channel, missing value 'ipc' in ${x7}`);
    }
}
class ERR_CHILD_PROCESS_STDIO_MAXBUFFER extends NodeRangeError {
    constructor(x8){
        super("ERR_CHILD_PROCESS_STDIO_MAXBUFFER", `${x8} maxBuffer length exceeded`);
    }
}
class ERR_CONSOLE_WRITABLE_STREAM extends NodeTypeError {
    constructor(x9){
        super("ERR_CONSOLE_WRITABLE_STREAM", `Console expects a writable stream instance for ${x9}`);
    }
}
class ERR_CONTEXT_NOT_INITIALIZED extends NodeError {
    constructor(){
        super("ERR_CONTEXT_NOT_INITIALIZED", "context used is not initialized");
    }
}
class ERR_CPU_USAGE extends NodeError {
    constructor(x10){
        super("ERR_CPU_USAGE", `Unable to obtain cpu usage ${x10}`);
    }
}
class ERR_CRYPTO_CUSTOM_ENGINE_NOT_SUPPORTED extends NodeError {
    constructor(){
        super("ERR_CRYPTO_CUSTOM_ENGINE_NOT_SUPPORTED", "Custom engines not supported by this OpenSSL");
    }
}
class ERR_CRYPTO_ECDH_INVALID_FORMAT extends NodeTypeError {
    constructor(x11){
        super("ERR_CRYPTO_ECDH_INVALID_FORMAT", `Invalid ECDH format: ${x11}`);
    }
}
class ERR_CRYPTO_ECDH_INVALID_PUBLIC_KEY extends NodeError {
    constructor(){
        super("ERR_CRYPTO_ECDH_INVALID_PUBLIC_KEY", "Public key is not valid for specified curve");
    }
}
class ERR_CRYPTO_ENGINE_UNKNOWN extends NodeError {
    constructor(x12){
        super("ERR_CRYPTO_ENGINE_UNKNOWN", `Engine "${x12}" was not found`);
    }
}
class ERR_CRYPTO_FIPS_FORCED extends NodeError {
    constructor(){
        super("ERR_CRYPTO_FIPS_FORCED", "Cannot set FIPS mode, it was forced with --force-fips at startup.");
    }
}
class ERR_CRYPTO_FIPS_UNAVAILABLE extends NodeError {
    constructor(){
        super("ERR_CRYPTO_FIPS_UNAVAILABLE", "Cannot set FIPS mode in a non-FIPS build.");
    }
}
class ERR_CRYPTO_HASH_FINALIZED extends NodeError {
    constructor(){
        super("ERR_CRYPTO_HASH_FINALIZED", "Digest already called");
    }
}
class ERR_CRYPTO_HASH_UPDATE_FAILED extends NodeError {
    constructor(){
        super("ERR_CRYPTO_HASH_UPDATE_FAILED", "Hash update failed");
    }
}
class ERR_CRYPTO_INCOMPATIBLE_KEY extends NodeError {
    constructor(x13, y1){
        super("ERR_CRYPTO_INCOMPATIBLE_KEY", `Incompatible ${x13}: ${y1}`);
    }
}
class ERR_CRYPTO_INCOMPATIBLE_KEY_OPTIONS extends NodeError {
    constructor(x14, y2){
        super("ERR_CRYPTO_INCOMPATIBLE_KEY_OPTIONS", `The selected key encoding ${x14} ${y2}.`);
    }
}
class ERR_CRYPTO_INVALID_DIGEST extends NodeTypeError {
    constructor(x15){
        super("ERR_CRYPTO_INVALID_DIGEST", `Invalid digest: ${x15}`);
    }
}
class ERR_CRYPTO_INVALID_KEY_OBJECT_TYPE extends NodeTypeError {
    constructor(x16, y3){
        super("ERR_CRYPTO_INVALID_KEY_OBJECT_TYPE", `Invalid key object type ${x16}, expected ${y3}.`);
    }
}
class ERR_CRYPTO_INVALID_STATE extends NodeError {
    constructor(x17){
        super("ERR_CRYPTO_INVALID_STATE", `Invalid state for operation ${x17}`);
    }
}
class ERR_CRYPTO_PBKDF2_ERROR extends NodeError {
    constructor(){
        super("ERR_CRYPTO_PBKDF2_ERROR", "PBKDF2 error");
    }
}
class ERR_CRYPTO_SCRYPT_INVALID_PARAMETER extends NodeError {
    constructor(){
        super("ERR_CRYPTO_SCRYPT_INVALID_PARAMETER", "Invalid scrypt parameter");
    }
}
class ERR_CRYPTO_SCRYPT_NOT_SUPPORTED extends NodeError {
    constructor(){
        super("ERR_CRYPTO_SCRYPT_NOT_SUPPORTED", "Scrypt algorithm not supported");
    }
}
class ERR_CRYPTO_SIGN_KEY_REQUIRED extends NodeError {
    constructor(){
        super("ERR_CRYPTO_SIGN_KEY_REQUIRED", "No key provided to sign");
    }
}
class ERR_DIR_CLOSED extends NodeError {
    constructor(){
        super("ERR_DIR_CLOSED", "Directory handle was closed");
    }
}
class ERR_DIR_CONCURRENT_OPERATION extends NodeError {
    constructor(){
        super("ERR_DIR_CONCURRENT_OPERATION", "Cannot do synchronous work on directory handle with concurrent asynchronous operations");
    }
}
class ERR_DNS_SET_SERVERS_FAILED extends NodeError {
    constructor(x18, y4){
        super("ERR_DNS_SET_SERVERS_FAILED", `c-ares failed to set servers: "${x18}" [${y4}]`);
    }
}
class ERR_DOMAIN_CALLBACK_NOT_AVAILABLE extends NodeError {
    constructor(){
        super("ERR_DOMAIN_CALLBACK_NOT_AVAILABLE", "A callback was registered through " + "process.setUncaughtExceptionCaptureCallback(), which is mutually " + "exclusive with using the `domain` module");
    }
}
class ERR_DOMAIN_CANNOT_SET_UNCAUGHT_EXCEPTION_CAPTURE extends NodeError {
    constructor(){
        super("ERR_DOMAIN_CANNOT_SET_UNCAUGHT_EXCEPTION_CAPTURE", "The `domain` module is in use, which is mutually exclusive with calling " + "process.setUncaughtExceptionCaptureCallback()");
    }
}
class ERR_ENCODING_INVALID_ENCODED_DATA extends NodeErrorAbstraction {
    errno;
    constructor(encoding, ret){
        super(TypeError.prototype.name, "ERR_ENCODING_INVALID_ENCODED_DATA", `The encoded data was not valid for encoding ${encoding}`);
        Object.setPrototypeOf(this, TypeError.prototype);
        this.errno = ret;
    }
}
const windows = [
    [
        -4093,
        [
            "E2BIG",
            "argument list too long"
        ]
    ],
    [
        -4092,
        [
            "EACCES",
            "permission denied"
        ]
    ],
    [
        -4091,
        [
            "EADDRINUSE",
            "address already in use"
        ]
    ],
    [
        -4090,
        [
            "EADDRNOTAVAIL",
            "address not available"
        ]
    ],
    [
        -4089,
        [
            "EAFNOSUPPORT",
            "address family not supported"
        ]
    ],
    [
        -4088,
        [
            "EAGAIN",
            "resource temporarily unavailable"
        ]
    ],
    [
        -3000,
        [
            "EAI_ADDRFAMILY",
            "address family not supported"
        ]
    ],
    [
        -3001,
        [
            "EAI_AGAIN",
            "temporary failure"
        ]
    ],
    [
        -3002,
        [
            "EAI_BADFLAGS",
            "bad ai_flags value"
        ]
    ],
    [
        -3013,
        [
            "EAI_BADHINTS",
            "invalid value for hints"
        ]
    ],
    [
        -3003,
        [
            "EAI_CANCELED",
            "request canceled"
        ]
    ],
    [
        -3004,
        [
            "EAI_FAIL",
            "permanent failure"
        ]
    ],
    [
        -3005,
        [
            "EAI_FAMILY",
            "ai_family not supported"
        ]
    ],
    [
        -3006,
        [
            "EAI_MEMORY",
            "out of memory"
        ]
    ],
    [
        -3007,
        [
            "EAI_NODATA",
            "no address"
        ]
    ],
    [
        -3008,
        [
            "EAI_NONAME",
            "unknown node or service"
        ]
    ],
    [
        -3009,
        [
            "EAI_OVERFLOW",
            "argument buffer overflow"
        ]
    ],
    [
        -3014,
        [
            "EAI_PROTOCOL",
            "resolved protocol is unknown"
        ]
    ],
    [
        -3010,
        [
            "EAI_SERVICE",
            "service not available for socket type"
        ]
    ],
    [
        -3011,
        [
            "EAI_SOCKTYPE",
            "socket type not supported"
        ]
    ],
    [
        -4084,
        [
            "EALREADY",
            "connection already in progress"
        ]
    ],
    [
        -4083,
        [
            "EBADF",
            "bad file descriptor"
        ]
    ],
    [
        -4082,
        [
            "EBUSY",
            "resource busy or locked"
        ]
    ],
    [
        -4081,
        [
            "ECANCELED",
            "operation canceled"
        ]
    ],
    [
        -4080,
        [
            "ECHARSET",
            "invalid Unicode character"
        ]
    ],
    [
        -4079,
        [
            "ECONNABORTED",
            "software caused connection abort"
        ]
    ],
    [
        -4078,
        [
            "ECONNREFUSED",
            "connection refused"
        ]
    ],
    [
        -4077,
        [
            "ECONNRESET",
            "connection reset by peer"
        ]
    ],
    [
        -4076,
        [
            "EDESTADDRREQ",
            "destination address required"
        ]
    ],
    [
        -4075,
        [
            "EEXIST",
            "file already exists"
        ]
    ],
    [
        -4074,
        [
            "EFAULT",
            "bad address in system call argument"
        ]
    ],
    [
        -4036,
        [
            "EFBIG",
            "file too large"
        ]
    ],
    [
        -4073,
        [
            "EHOSTUNREACH",
            "host is unreachable"
        ]
    ],
    [
        -4072,
        [
            "EINTR",
            "interrupted system call"
        ]
    ],
    [
        -4071,
        [
            "EINVAL",
            "invalid argument"
        ]
    ],
    [
        -4070,
        [
            "EIO",
            "i/o error"
        ]
    ],
    [
        -4069,
        [
            "EISCONN",
            "socket is already connected"
        ]
    ],
    [
        -4068,
        [
            "EISDIR",
            "illegal operation on a directory"
        ]
    ],
    [
        -4067,
        [
            "ELOOP",
            "too many symbolic links encountered"
        ]
    ],
    [
        -4066,
        [
            "EMFILE",
            "too many open files"
        ]
    ],
    [
        -4065,
        [
            "EMSGSIZE",
            "message too long"
        ]
    ],
    [
        -4064,
        [
            "ENAMETOOLONG",
            "name too long"
        ]
    ],
    [
        -4063,
        [
            "ENETDOWN",
            "network is down"
        ]
    ],
    [
        -4062,
        [
            "ENETUNREACH",
            "network is unreachable"
        ]
    ],
    [
        -4061,
        [
            "ENFILE",
            "file table overflow"
        ]
    ],
    [
        -4060,
        [
            "ENOBUFS",
            "no buffer space available"
        ]
    ],
    [
        -4059,
        [
            "ENODEV",
            "no such device"
        ]
    ],
    [
        -4058,
        [
            "ENOENT",
            "no such file or directory"
        ]
    ],
    [
        -4057,
        [
            "ENOMEM",
            "not enough memory"
        ]
    ],
    [
        -4056,
        [
            "ENONET",
            "machine is not on the network"
        ]
    ],
    [
        -4035,
        [
            "ENOPROTOOPT",
            "protocol not available"
        ]
    ],
    [
        -4055,
        [
            "ENOSPC",
            "no space left on device"
        ]
    ],
    [
        -4054,
        [
            "ENOSYS",
            "function not implemented"
        ]
    ],
    [
        -4053,
        [
            "ENOTCONN",
            "socket is not connected"
        ]
    ],
    [
        -4052,
        [
            "ENOTDIR",
            "not a directory"
        ]
    ],
    [
        -4051,
        [
            "ENOTEMPTY",
            "directory not empty"
        ]
    ],
    [
        -4050,
        [
            "ENOTSOCK",
            "socket operation on non-socket"
        ]
    ],
    [
        -4049,
        [
            "ENOTSUP",
            "operation not supported on socket"
        ]
    ],
    [
        -4048,
        [
            "EPERM",
            "operation not permitted"
        ]
    ],
    [
        -4047,
        [
            "EPIPE",
            "broken pipe"
        ]
    ],
    [
        -4046,
        [
            "EPROTO",
            "protocol error"
        ]
    ],
    [
        -4045,
        [
            "EPROTONOSUPPORT",
            "protocol not supported"
        ]
    ],
    [
        -4044,
        [
            "EPROTOTYPE",
            "protocol wrong type for socket"
        ]
    ],
    [
        -4034,
        [
            "ERANGE",
            "result too large"
        ]
    ],
    [
        -4043,
        [
            "EROFS",
            "read-only file system"
        ]
    ],
    [
        -4042,
        [
            "ESHUTDOWN",
            "cannot send after transport endpoint shutdown"
        ]
    ],
    [
        -4041,
        [
            "ESPIPE",
            "invalid seek"
        ]
    ],
    [
        -4040,
        [
            "ESRCH",
            "no such process"
        ]
    ],
    [
        -4039,
        [
            "ETIMEDOUT",
            "connection timed out"
        ]
    ],
    [
        -4038,
        [
            "ETXTBSY",
            "text file is busy"
        ]
    ],
    [
        -4037,
        [
            "EXDEV",
            "cross-device link not permitted"
        ]
    ],
    [
        -4094,
        [
            "UNKNOWN",
            "unknown error"
        ]
    ],
    [
        -4095,
        [
            "EOF",
            "end of file"
        ]
    ],
    [
        -4033,
        [
            "ENXIO",
            "no such device or address"
        ]
    ],
    [
        -4032,
        [
            "EMLINK",
            "too many links"
        ]
    ],
    [
        -4031,
        [
            "EHOSTDOWN",
            "host is down"
        ]
    ],
    [
        -4030,
        [
            "EREMOTEIO",
            "remote I/O error"
        ]
    ],
    [
        -4029,
        [
            "ENOTTY",
            "inappropriate ioctl for device"
        ]
    ],
    [
        -4028,
        [
            "EFTYPE",
            "inappropriate file type or format"
        ]
    ],
    [
        -4027,
        [
            "EILSEQ",
            "illegal byte sequence"
        ]
    ], 
];
const darwin = [
    [
        -7,
        [
            "E2BIG",
            "argument list too long"
        ]
    ],
    [
        -13,
        [
            "EACCES",
            "permission denied"
        ]
    ],
    [
        -48,
        [
            "EADDRINUSE",
            "address already in use"
        ]
    ],
    [
        -49,
        [
            "EADDRNOTAVAIL",
            "address not available"
        ]
    ],
    [
        -47,
        [
            "EAFNOSUPPORT",
            "address family not supported"
        ]
    ],
    [
        -35,
        [
            "EAGAIN",
            "resource temporarily unavailable"
        ]
    ],
    [
        -3000,
        [
            "EAI_ADDRFAMILY",
            "address family not supported"
        ]
    ],
    [
        -3001,
        [
            "EAI_AGAIN",
            "temporary failure"
        ]
    ],
    [
        -3002,
        [
            "EAI_BADFLAGS",
            "bad ai_flags value"
        ]
    ],
    [
        -3013,
        [
            "EAI_BADHINTS",
            "invalid value for hints"
        ]
    ],
    [
        -3003,
        [
            "EAI_CANCELED",
            "request canceled"
        ]
    ],
    [
        -3004,
        [
            "EAI_FAIL",
            "permanent failure"
        ]
    ],
    [
        -3005,
        [
            "EAI_FAMILY",
            "ai_family not supported"
        ]
    ],
    [
        -3006,
        [
            "EAI_MEMORY",
            "out of memory"
        ]
    ],
    [
        -3007,
        [
            "EAI_NODATA",
            "no address"
        ]
    ],
    [
        -3008,
        [
            "EAI_NONAME",
            "unknown node or service"
        ]
    ],
    [
        -3009,
        [
            "EAI_OVERFLOW",
            "argument buffer overflow"
        ]
    ],
    [
        -3014,
        [
            "EAI_PROTOCOL",
            "resolved protocol is unknown"
        ]
    ],
    [
        -3010,
        [
            "EAI_SERVICE",
            "service not available for socket type"
        ]
    ],
    [
        -3011,
        [
            "EAI_SOCKTYPE",
            "socket type not supported"
        ]
    ],
    [
        -37,
        [
            "EALREADY",
            "connection already in progress"
        ]
    ],
    [
        -9,
        [
            "EBADF",
            "bad file descriptor"
        ]
    ],
    [
        -16,
        [
            "EBUSY",
            "resource busy or locked"
        ]
    ],
    [
        -89,
        [
            "ECANCELED",
            "operation canceled"
        ]
    ],
    [
        -4080,
        [
            "ECHARSET",
            "invalid Unicode character"
        ]
    ],
    [
        -53,
        [
            "ECONNABORTED",
            "software caused connection abort"
        ]
    ],
    [
        -61,
        [
            "ECONNREFUSED",
            "connection refused"
        ]
    ],
    [
        -54,
        [
            "ECONNRESET",
            "connection reset by peer"
        ]
    ],
    [
        -39,
        [
            "EDESTADDRREQ",
            "destination address required"
        ]
    ],
    [
        -17,
        [
            "EEXIST",
            "file already exists"
        ]
    ],
    [
        -14,
        [
            "EFAULT",
            "bad address in system call argument"
        ]
    ],
    [
        -27,
        [
            "EFBIG",
            "file too large"
        ]
    ],
    [
        -65,
        [
            "EHOSTUNREACH",
            "host is unreachable"
        ]
    ],
    [
        -4,
        [
            "EINTR",
            "interrupted system call"
        ]
    ],
    [
        -22,
        [
            "EINVAL",
            "invalid argument"
        ]
    ],
    [
        -5,
        [
            "EIO",
            "i/o error"
        ]
    ],
    [
        -56,
        [
            "EISCONN",
            "socket is already connected"
        ]
    ],
    [
        -21,
        [
            "EISDIR",
            "illegal operation on a directory"
        ]
    ],
    [
        -62,
        [
            "ELOOP",
            "too many symbolic links encountered"
        ]
    ],
    [
        -24,
        [
            "EMFILE",
            "too many open files"
        ]
    ],
    [
        -40,
        [
            "EMSGSIZE",
            "message too long"
        ]
    ],
    [
        -63,
        [
            "ENAMETOOLONG",
            "name too long"
        ]
    ],
    [
        -50,
        [
            "ENETDOWN",
            "network is down"
        ]
    ],
    [
        -51,
        [
            "ENETUNREACH",
            "network is unreachable"
        ]
    ],
    [
        -23,
        [
            "ENFILE",
            "file table overflow"
        ]
    ],
    [
        -55,
        [
            "ENOBUFS",
            "no buffer space available"
        ]
    ],
    [
        -19,
        [
            "ENODEV",
            "no such device"
        ]
    ],
    [
        -2,
        [
            "ENOENT",
            "no such file or directory"
        ]
    ],
    [
        -12,
        [
            "ENOMEM",
            "not enough memory"
        ]
    ],
    [
        -4056,
        [
            "ENONET",
            "machine is not on the network"
        ]
    ],
    [
        -42,
        [
            "ENOPROTOOPT",
            "protocol not available"
        ]
    ],
    [
        -28,
        [
            "ENOSPC",
            "no space left on device"
        ]
    ],
    [
        -78,
        [
            "ENOSYS",
            "function not implemented"
        ]
    ],
    [
        -57,
        [
            "ENOTCONN",
            "socket is not connected"
        ]
    ],
    [
        -20,
        [
            "ENOTDIR",
            "not a directory"
        ]
    ],
    [
        -66,
        [
            "ENOTEMPTY",
            "directory not empty"
        ]
    ],
    [
        -38,
        [
            "ENOTSOCK",
            "socket operation on non-socket"
        ]
    ],
    [
        -45,
        [
            "ENOTSUP",
            "operation not supported on socket"
        ]
    ],
    [
        -1,
        [
            "EPERM",
            "operation not permitted"
        ]
    ],
    [
        -32,
        [
            "EPIPE",
            "broken pipe"
        ]
    ],
    [
        -100,
        [
            "EPROTO",
            "protocol error"
        ]
    ],
    [
        -43,
        [
            "EPROTONOSUPPORT",
            "protocol not supported"
        ]
    ],
    [
        -41,
        [
            "EPROTOTYPE",
            "protocol wrong type for socket"
        ]
    ],
    [
        -34,
        [
            "ERANGE",
            "result too large"
        ]
    ],
    [
        -30,
        [
            "EROFS",
            "read-only file system"
        ]
    ],
    [
        -58,
        [
            "ESHUTDOWN",
            "cannot send after transport endpoint shutdown"
        ]
    ],
    [
        -29,
        [
            "ESPIPE",
            "invalid seek"
        ]
    ],
    [
        -3,
        [
            "ESRCH",
            "no such process"
        ]
    ],
    [
        -60,
        [
            "ETIMEDOUT",
            "connection timed out"
        ]
    ],
    [
        -26,
        [
            "ETXTBSY",
            "text file is busy"
        ]
    ],
    [
        -18,
        [
            "EXDEV",
            "cross-device link not permitted"
        ]
    ],
    [
        -4094,
        [
            "UNKNOWN",
            "unknown error"
        ]
    ],
    [
        -4095,
        [
            "EOF",
            "end of file"
        ]
    ],
    [
        -6,
        [
            "ENXIO",
            "no such device or address"
        ]
    ],
    [
        -31,
        [
            "EMLINK",
            "too many links"
        ]
    ],
    [
        -64,
        [
            "EHOSTDOWN",
            "host is down"
        ]
    ],
    [
        -4030,
        [
            "EREMOTEIO",
            "remote I/O error"
        ]
    ],
    [
        -25,
        [
            "ENOTTY",
            "inappropriate ioctl for device"
        ]
    ],
    [
        -79,
        [
            "EFTYPE",
            "inappropriate file type or format"
        ]
    ],
    [
        -92,
        [
            "EILSEQ",
            "illegal byte sequence"
        ]
    ], 
];
const linux = [
    [
        -7,
        [
            "E2BIG",
            "argument list too long"
        ]
    ],
    [
        -13,
        [
            "EACCES",
            "permission denied"
        ]
    ],
    [
        -98,
        [
            "EADDRINUSE",
            "address already in use"
        ]
    ],
    [
        -99,
        [
            "EADDRNOTAVAIL",
            "address not available"
        ]
    ],
    [
        -97,
        [
            "EAFNOSUPPORT",
            "address family not supported"
        ]
    ],
    [
        -11,
        [
            "EAGAIN",
            "resource temporarily unavailable"
        ]
    ],
    [
        -3000,
        [
            "EAI_ADDRFAMILY",
            "address family not supported"
        ]
    ],
    [
        -3001,
        [
            "EAI_AGAIN",
            "temporary failure"
        ]
    ],
    [
        -3002,
        [
            "EAI_BADFLAGS",
            "bad ai_flags value"
        ]
    ],
    [
        -3013,
        [
            "EAI_BADHINTS",
            "invalid value for hints"
        ]
    ],
    [
        -3003,
        [
            "EAI_CANCELED",
            "request canceled"
        ]
    ],
    [
        -3004,
        [
            "EAI_FAIL",
            "permanent failure"
        ]
    ],
    [
        -3005,
        [
            "EAI_FAMILY",
            "ai_family not supported"
        ]
    ],
    [
        -3006,
        [
            "EAI_MEMORY",
            "out of memory"
        ]
    ],
    [
        -3007,
        [
            "EAI_NODATA",
            "no address"
        ]
    ],
    [
        -3008,
        [
            "EAI_NONAME",
            "unknown node or service"
        ]
    ],
    [
        -3009,
        [
            "EAI_OVERFLOW",
            "argument buffer overflow"
        ]
    ],
    [
        -3014,
        [
            "EAI_PROTOCOL",
            "resolved protocol is unknown"
        ]
    ],
    [
        -3010,
        [
            "EAI_SERVICE",
            "service not available for socket type"
        ]
    ],
    [
        -3011,
        [
            "EAI_SOCKTYPE",
            "socket type not supported"
        ]
    ],
    [
        -114,
        [
            "EALREADY",
            "connection already in progress"
        ]
    ],
    [
        -9,
        [
            "EBADF",
            "bad file descriptor"
        ]
    ],
    [
        -16,
        [
            "EBUSY",
            "resource busy or locked"
        ]
    ],
    [
        -125,
        [
            "ECANCELED",
            "operation canceled"
        ]
    ],
    [
        -4080,
        [
            "ECHARSET",
            "invalid Unicode character"
        ]
    ],
    [
        -103,
        [
            "ECONNABORTED",
            "software caused connection abort"
        ]
    ],
    [
        -111,
        [
            "ECONNREFUSED",
            "connection refused"
        ]
    ],
    [
        -104,
        [
            "ECONNRESET",
            "connection reset by peer"
        ]
    ],
    [
        -89,
        [
            "EDESTADDRREQ",
            "destination address required"
        ]
    ],
    [
        -17,
        [
            "EEXIST",
            "file already exists"
        ]
    ],
    [
        -14,
        [
            "EFAULT",
            "bad address in system call argument"
        ]
    ],
    [
        -27,
        [
            "EFBIG",
            "file too large"
        ]
    ],
    [
        -113,
        [
            "EHOSTUNREACH",
            "host is unreachable"
        ]
    ],
    [
        -4,
        [
            "EINTR",
            "interrupted system call"
        ]
    ],
    [
        -22,
        [
            "EINVAL",
            "invalid argument"
        ]
    ],
    [
        -5,
        [
            "EIO",
            "i/o error"
        ]
    ],
    [
        -106,
        [
            "EISCONN",
            "socket is already connected"
        ]
    ],
    [
        -21,
        [
            "EISDIR",
            "illegal operation on a directory"
        ]
    ],
    [
        -40,
        [
            "ELOOP",
            "too many symbolic links encountered"
        ]
    ],
    [
        -24,
        [
            "EMFILE",
            "too many open files"
        ]
    ],
    [
        -90,
        [
            "EMSGSIZE",
            "message too long"
        ]
    ],
    [
        -36,
        [
            "ENAMETOOLONG",
            "name too long"
        ]
    ],
    [
        -100,
        [
            "ENETDOWN",
            "network is down"
        ]
    ],
    [
        -101,
        [
            "ENETUNREACH",
            "network is unreachable"
        ]
    ],
    [
        -23,
        [
            "ENFILE",
            "file table overflow"
        ]
    ],
    [
        -105,
        [
            "ENOBUFS",
            "no buffer space available"
        ]
    ],
    [
        -19,
        [
            "ENODEV",
            "no such device"
        ]
    ],
    [
        -2,
        [
            "ENOENT",
            "no such file or directory"
        ]
    ],
    [
        -12,
        [
            "ENOMEM",
            "not enough memory"
        ]
    ],
    [
        -64,
        [
            "ENONET",
            "machine is not on the network"
        ]
    ],
    [
        -92,
        [
            "ENOPROTOOPT",
            "protocol not available"
        ]
    ],
    [
        -28,
        [
            "ENOSPC",
            "no space left on device"
        ]
    ],
    [
        -38,
        [
            "ENOSYS",
            "function not implemented"
        ]
    ],
    [
        -107,
        [
            "ENOTCONN",
            "socket is not connected"
        ]
    ],
    [
        -20,
        [
            "ENOTDIR",
            "not a directory"
        ]
    ],
    [
        -39,
        [
            "ENOTEMPTY",
            "directory not empty"
        ]
    ],
    [
        -88,
        [
            "ENOTSOCK",
            "socket operation on non-socket"
        ]
    ],
    [
        -95,
        [
            "ENOTSUP",
            "operation not supported on socket"
        ]
    ],
    [
        -1,
        [
            "EPERM",
            "operation not permitted"
        ]
    ],
    [
        -32,
        [
            "EPIPE",
            "broken pipe"
        ]
    ],
    [
        -71,
        [
            "EPROTO",
            "protocol error"
        ]
    ],
    [
        -93,
        [
            "EPROTONOSUPPORT",
            "protocol not supported"
        ]
    ],
    [
        -91,
        [
            "EPROTOTYPE",
            "protocol wrong type for socket"
        ]
    ],
    [
        -34,
        [
            "ERANGE",
            "result too large"
        ]
    ],
    [
        -30,
        [
            "EROFS",
            "read-only file system"
        ]
    ],
    [
        -108,
        [
            "ESHUTDOWN",
            "cannot send after transport endpoint shutdown"
        ]
    ],
    [
        -29,
        [
            "ESPIPE",
            "invalid seek"
        ]
    ],
    [
        -3,
        [
            "ESRCH",
            "no such process"
        ]
    ],
    [
        -110,
        [
            "ETIMEDOUT",
            "connection timed out"
        ]
    ],
    [
        -26,
        [
            "ETXTBSY",
            "text file is busy"
        ]
    ],
    [
        -18,
        [
            "EXDEV",
            "cross-device link not permitted"
        ]
    ],
    [
        -4094,
        [
            "UNKNOWN",
            "unknown error"
        ]
    ],
    [
        -4095,
        [
            "EOF",
            "end of file"
        ]
    ],
    [
        -6,
        [
            "ENXIO",
            "no such device or address"
        ]
    ],
    [
        -31,
        [
            "EMLINK",
            "too many links"
        ]
    ],
    [
        -112,
        [
            "EHOSTDOWN",
            "host is down"
        ]
    ],
    [
        -121,
        [
            "EREMOTEIO",
            "remote I/O error"
        ]
    ],
    [
        -25,
        [
            "ENOTTY",
            "inappropriate ioctl for device"
        ]
    ],
    [
        -4028,
        [
            "EFTYPE",
            "inappropriate file type or format"
        ]
    ],
    [
        -84,
        [
            "EILSEQ",
            "illegal byte sequence"
        ]
    ], 
];
const errorMap = new Map(osType === "windows" ? windows : osType === "darwin" ? darwin : osType === "linux" ? linux : unreachable());
class ERR_ENCODING_NOT_SUPPORTED extends NodeRangeError {
    constructor(x19){
        super("ERR_ENCODING_NOT_SUPPORTED", `The "${x19}" encoding is not supported`);
    }
}
class ERR_EVAL_ESM_CANNOT_PRINT extends NodeError {
    constructor(){
        super("ERR_EVAL_ESM_CANNOT_PRINT", `--print cannot be used with ESM input`);
    }
}
class ERR_EVENT_RECURSION extends NodeError {
    constructor(x20){
        super("ERR_EVENT_RECURSION", `The event "${x20}" is already being dispatched`);
    }
}
class ERR_FEATURE_UNAVAILABLE_ON_PLATFORM extends NodeTypeError {
    constructor(x21){
        super("ERR_FEATURE_UNAVAILABLE_ON_PLATFORM", `The feature ${x21} is unavailable on the current platform, which is being used to run Node.js`);
    }
}
class ERR_FS_FILE_TOO_LARGE extends NodeRangeError {
    constructor(x22){
        super("ERR_FS_FILE_TOO_LARGE", `File size (${x22}) is greater than 2 GB`);
    }
}
class ERR_FS_INVALID_SYMLINK_TYPE extends NodeError {
    constructor(x23){
        super("ERR_FS_INVALID_SYMLINK_TYPE", `Symlink type must be one of "dir", "file", or "junction". Received "${x23}"`);
    }
}
class ERR_HTTP2_ALTSVC_INVALID_ORIGIN extends NodeTypeError {
    constructor(){
        super("ERR_HTTP2_ALTSVC_INVALID_ORIGIN", `HTTP/2 ALTSVC frames require a valid origin`);
    }
}
class ERR_HTTP2_ALTSVC_LENGTH extends NodeTypeError {
    constructor(){
        super("ERR_HTTP2_ALTSVC_LENGTH", `HTTP/2 ALTSVC frames are limited to 16382 bytes`);
    }
}
class ERR_HTTP2_CONNECT_AUTHORITY extends NodeError {
    constructor(){
        super("ERR_HTTP2_CONNECT_AUTHORITY", `:authority header is required for CONNECT requests`);
    }
}
class ERR_HTTP2_CONNECT_PATH extends NodeError {
    constructor(){
        super("ERR_HTTP2_CONNECT_PATH", `The :path header is forbidden for CONNECT requests`);
    }
}
class ERR_HTTP2_CONNECT_SCHEME extends NodeError {
    constructor(){
        super("ERR_HTTP2_CONNECT_SCHEME", `The :scheme header is forbidden for CONNECT requests`);
    }
}
class ERR_HTTP2_GOAWAY_SESSION extends NodeError {
    constructor(){
        super("ERR_HTTP2_GOAWAY_SESSION", `New streams cannot be created after receiving a GOAWAY`);
    }
}
class ERR_HTTP2_HEADERS_AFTER_RESPOND extends NodeError {
    constructor(){
        super("ERR_HTTP2_HEADERS_AFTER_RESPOND", `Cannot specify additional headers after response initiated`);
    }
}
class ERR_HTTP2_HEADERS_SENT extends NodeError {
    constructor(){
        super("ERR_HTTP2_HEADERS_SENT", `Response has already been initiated.`);
    }
}
class ERR_HTTP2_HEADER_SINGLE_VALUE extends NodeTypeError {
    constructor(x24){
        super("ERR_HTTP2_HEADER_SINGLE_VALUE", `Header field "${x24}" must only have a single value`);
    }
}
class ERR_HTTP2_INFO_STATUS_NOT_ALLOWED extends NodeRangeError {
    constructor(){
        super("ERR_HTTP2_INFO_STATUS_NOT_ALLOWED", `Informational status codes cannot be used`);
    }
}
class ERR_HTTP2_INVALID_CONNECTION_HEADERS extends NodeTypeError {
    constructor(x25){
        super("ERR_HTTP2_INVALID_CONNECTION_HEADERS", `HTTP/1 Connection specific headers are forbidden: "${x25}"`);
    }
}
class ERR_HTTP2_INVALID_HEADER_VALUE extends NodeTypeError {
    constructor(x26, y5){
        super("ERR_HTTP2_INVALID_HEADER_VALUE", `Invalid value "${x26}" for header "${y5}"`);
    }
}
class ERR_HTTP2_INVALID_INFO_STATUS extends NodeRangeError {
    constructor(x27){
        super("ERR_HTTP2_INVALID_INFO_STATUS", `Invalid informational status code: ${x27}`);
    }
}
class ERR_HTTP2_INVALID_ORIGIN extends NodeTypeError {
    constructor(){
        super("ERR_HTTP2_INVALID_ORIGIN", `HTTP/2 ORIGIN frames require a valid origin`);
    }
}
class ERR_HTTP2_INVALID_PACKED_SETTINGS_LENGTH extends NodeRangeError {
    constructor(){
        super("ERR_HTTP2_INVALID_PACKED_SETTINGS_LENGTH", `Packed settings length must be a multiple of six`);
    }
}
class ERR_HTTP2_INVALID_PSEUDOHEADER extends NodeTypeError {
    constructor(x28){
        super("ERR_HTTP2_INVALID_PSEUDOHEADER", `"${x28}" is an invalid pseudoheader or is used incorrectly`);
    }
}
class ERR_HTTP2_INVALID_SESSION extends NodeError {
    constructor(){
        super("ERR_HTTP2_INVALID_SESSION", `The session has been destroyed`);
    }
}
class ERR_HTTP2_INVALID_STREAM extends NodeError {
    constructor(){
        super("ERR_HTTP2_INVALID_STREAM", `The stream has been destroyed`);
    }
}
class ERR_HTTP2_MAX_PENDING_SETTINGS_ACK extends NodeError {
    constructor(){
        super("ERR_HTTP2_MAX_PENDING_SETTINGS_ACK", `Maximum number of pending settings acknowledgements`);
    }
}
class ERR_HTTP2_NESTED_PUSH extends NodeError {
    constructor(){
        super("ERR_HTTP2_NESTED_PUSH", `A push stream cannot initiate another push stream.`);
    }
}
class ERR_HTTP2_NO_SOCKET_MANIPULATION extends NodeError {
    constructor(){
        super("ERR_HTTP2_NO_SOCKET_MANIPULATION", `HTTP/2 sockets should not be directly manipulated (e.g. read and written)`);
    }
}
class ERR_HTTP2_ORIGIN_LENGTH extends NodeTypeError {
    constructor(){
        super("ERR_HTTP2_ORIGIN_LENGTH", `HTTP/2 ORIGIN frames are limited to 16382 bytes`);
    }
}
class ERR_HTTP2_OUT_OF_STREAMS extends NodeError {
    constructor(){
        super("ERR_HTTP2_OUT_OF_STREAMS", `No stream ID is available because maximum stream ID has been reached`);
    }
}
class ERR_HTTP2_PAYLOAD_FORBIDDEN extends NodeError {
    constructor(x29){
        super("ERR_HTTP2_PAYLOAD_FORBIDDEN", `Responses with ${x29} status must not have a payload`);
    }
}
class ERR_HTTP2_PING_CANCEL extends NodeError {
    constructor(){
        super("ERR_HTTP2_PING_CANCEL", `HTTP2 ping cancelled`);
    }
}
class ERR_HTTP2_PING_LENGTH extends NodeRangeError {
    constructor(){
        super("ERR_HTTP2_PING_LENGTH", `HTTP2 ping payload must be 8 bytes`);
    }
}
class ERR_HTTP2_PSEUDOHEADER_NOT_ALLOWED extends NodeTypeError {
    constructor(){
        super("ERR_HTTP2_PSEUDOHEADER_NOT_ALLOWED", `Cannot set HTTP/2 pseudo-headers`);
    }
}
class ERR_HTTP2_PUSH_DISABLED extends NodeError {
    constructor(){
        super("ERR_HTTP2_PUSH_DISABLED", `HTTP/2 client has disabled push streams`);
    }
}
class ERR_HTTP2_SEND_FILE extends NodeError {
    constructor(){
        super("ERR_HTTP2_SEND_FILE", `Directories cannot be sent`);
    }
}
class ERR_HTTP2_SEND_FILE_NOSEEK extends NodeError {
    constructor(){
        super("ERR_HTTP2_SEND_FILE_NOSEEK", `Offset or length can only be specified for regular files`);
    }
}
class ERR_HTTP2_SESSION_ERROR extends NodeError {
    constructor(x30){
        super("ERR_HTTP2_SESSION_ERROR", `Session closed with error code ${x30}`);
    }
}
class ERR_HTTP2_SETTINGS_CANCEL extends NodeError {
    constructor(){
        super("ERR_HTTP2_SETTINGS_CANCEL", `HTTP2 session settings canceled`);
    }
}
class ERR_HTTP2_SOCKET_BOUND extends NodeError {
    constructor(){
        super("ERR_HTTP2_SOCKET_BOUND", `The socket is already bound to an Http2Session`);
    }
}
class ERR_HTTP2_SOCKET_UNBOUND extends NodeError {
    constructor(){
        super("ERR_HTTP2_SOCKET_UNBOUND", `The socket has been disconnected from the Http2Session`);
    }
}
class ERR_HTTP2_STATUS_101 extends NodeError {
    constructor(){
        super("ERR_HTTP2_STATUS_101", `HTTP status code 101 (Switching Protocols) is forbidden in HTTP/2`);
    }
}
class ERR_HTTP2_STATUS_INVALID extends NodeRangeError {
    constructor(x31){
        super("ERR_HTTP2_STATUS_INVALID", `Invalid status code: ${x31}`);
    }
}
class ERR_HTTP2_STREAM_ERROR extends NodeError {
    constructor(x32){
        super("ERR_HTTP2_STREAM_ERROR", `Stream closed with error code ${x32}`);
    }
}
class ERR_HTTP2_STREAM_SELF_DEPENDENCY extends NodeError {
    constructor(){
        super("ERR_HTTP2_STREAM_SELF_DEPENDENCY", `A stream cannot depend on itself`);
    }
}
class ERR_HTTP2_TRAILERS_ALREADY_SENT extends NodeError {
    constructor(){
        super("ERR_HTTP2_TRAILERS_ALREADY_SENT", `Trailing headers have already been sent`);
    }
}
class ERR_HTTP2_TRAILERS_NOT_READY extends NodeError {
    constructor(){
        super("ERR_HTTP2_TRAILERS_NOT_READY", `Trailing headers cannot be sent until after the wantTrailers event is emitted`);
    }
}
class ERR_HTTP2_UNSUPPORTED_PROTOCOL extends NodeError {
    constructor(x33){
        super("ERR_HTTP2_UNSUPPORTED_PROTOCOL", `protocol "${x33}" is unsupported.`);
    }
}
class ERR_HTTP_HEADERS_SENT extends NodeError {
    constructor(x34){
        super("ERR_HTTP_HEADERS_SENT", `Cannot ${x34} headers after they are sent to the client`);
    }
}
class ERR_HTTP_INVALID_HEADER_VALUE extends NodeTypeError {
    constructor(x35, y6){
        super("ERR_HTTP_INVALID_HEADER_VALUE", `Invalid value "${x35}" for header "${y6}"`);
    }
}
class ERR_HTTP_INVALID_STATUS_CODE extends NodeRangeError {
    constructor(x36){
        super("ERR_HTTP_INVALID_STATUS_CODE", `Invalid status code: ${x36}`);
    }
}
class ERR_HTTP_SOCKET_ENCODING extends NodeError {
    constructor(){
        super("ERR_HTTP_SOCKET_ENCODING", `Changing the socket encoding is not allowed per RFC7230 Section 3.`);
    }
}
class ERR_HTTP_TRAILER_INVALID extends NodeError {
    constructor(){
        super("ERR_HTTP_TRAILER_INVALID", `Trailers are invalid with this transfer encoding`);
    }
}
class ERR_INCOMPATIBLE_OPTION_PAIR extends NodeTypeError {
    constructor(x37, y7){
        super("ERR_INCOMPATIBLE_OPTION_PAIR", `Option "${x37}" cannot be used in combination with option "${y7}"`);
    }
}
class ERR_INPUT_TYPE_NOT_ALLOWED extends NodeError {
    constructor(){
        super("ERR_INPUT_TYPE_NOT_ALLOWED", `--input-type can only be used with string input via --eval, --print, or STDIN`);
    }
}
class ERR_INSPECTOR_ALREADY_ACTIVATED extends NodeError {
    constructor(){
        super("ERR_INSPECTOR_ALREADY_ACTIVATED", `Inspector is already activated. Close it with inspector.close() before activating it again.`);
    }
}
class ERR_INSPECTOR_ALREADY_CONNECTED extends NodeError {
    constructor(x38){
        super("ERR_INSPECTOR_ALREADY_CONNECTED", `${x38} is already connected`);
    }
}
class ERR_INSPECTOR_CLOSED extends NodeError {
    constructor(){
        super("ERR_INSPECTOR_CLOSED", `Session was closed`);
    }
}
class ERR_INSPECTOR_COMMAND extends NodeError {
    constructor(x39, y8){
        super("ERR_INSPECTOR_COMMAND", `Inspector error ${x39}: ${y8}`);
    }
}
class ERR_INSPECTOR_NOT_ACTIVE extends NodeError {
    constructor(){
        super("ERR_INSPECTOR_NOT_ACTIVE", `Inspector is not active`);
    }
}
class ERR_INSPECTOR_NOT_AVAILABLE extends NodeError {
    constructor(){
        super("ERR_INSPECTOR_NOT_AVAILABLE", `Inspector is not available`);
    }
}
class ERR_INSPECTOR_NOT_CONNECTED extends NodeError {
    constructor(){
        super("ERR_INSPECTOR_NOT_CONNECTED", `Session is not connected`);
    }
}
class ERR_INSPECTOR_NOT_WORKER extends NodeError {
    constructor(){
        super("ERR_INSPECTOR_NOT_WORKER", `Current thread is not a worker`);
    }
}
class ERR_INVALID_ASYNC_ID extends NodeRangeError {
    constructor(x40, y9){
        super("ERR_INVALID_ASYNC_ID", `Invalid ${x40} value: ${y9}`);
    }
}
class ERR_INVALID_BUFFER_SIZE extends NodeRangeError {
    constructor(x41){
        super("ERR_INVALID_BUFFER_SIZE", `Buffer size must be a multiple of ${x41}`);
    }
}
class ERR_INVALID_CALLBACK extends NodeTypeError {
    constructor(object){
        super("ERR_INVALID_CALLBACK", `Callback must be a function. Received ${JSON.stringify(object)}`);
    }
}
class ERR_INVALID_CURSOR_POS extends NodeTypeError {
    constructor(){
        super("ERR_INVALID_CURSOR_POS", `Cannot set cursor row without setting its column`);
    }
}
class ERR_INVALID_FD extends NodeRangeError {
    constructor(x42){
        super("ERR_INVALID_FD", `"fd" must be a positive integer: ${x42}`);
    }
}
class ERR_INVALID_FD_TYPE extends NodeTypeError {
    constructor(x43){
        super("ERR_INVALID_FD_TYPE", `Unsupported fd type: ${x43}`);
    }
}
class ERR_INVALID_FILE_URL_HOST extends NodeTypeError {
    constructor(x44){
        super("ERR_INVALID_FILE_URL_HOST", `File URL host must be "localhost" or empty on ${x44}`);
    }
}
class ERR_INVALID_FILE_URL_PATH extends NodeTypeError {
    constructor(x45){
        super("ERR_INVALID_FILE_URL_PATH", `File URL path ${x45}`);
    }
}
class ERR_INVALID_HANDLE_TYPE extends NodeTypeError {
    constructor(){
        super("ERR_INVALID_HANDLE_TYPE", `This handle type cannot be sent`);
    }
}
class ERR_INVALID_HTTP_TOKEN extends NodeTypeError {
    constructor(x46, y10){
        super("ERR_INVALID_HTTP_TOKEN", `${x46} must be a valid HTTP token ["${y10}"]`);
    }
}
class ERR_INVALID_IP_ADDRESS extends NodeTypeError {
    constructor(x47){
        super("ERR_INVALID_IP_ADDRESS", `Invalid IP address: ${x47}`);
    }
}
class ERR_INVALID_OPT_VALUE_ENCODING extends NodeTypeError {
    constructor(x48){
        super("ERR_INVALID_OPT_VALUE_ENCODING", `The value "${x48}" is invalid for option "encoding"`);
    }
}
class ERR_INVALID_PERFORMANCE_MARK extends NodeError {
    constructor(x49){
        super("ERR_INVALID_PERFORMANCE_MARK", `The "${x49}" performance mark has not been set`);
    }
}
class ERR_INVALID_PROTOCOL extends NodeTypeError {
    constructor(x50, y11){
        super("ERR_INVALID_PROTOCOL", `Protocol "${x50}" not supported. Expected "${y11}"`);
    }
}
class ERR_INVALID_REPL_EVAL_CONFIG extends NodeTypeError {
    constructor(){
        super("ERR_INVALID_REPL_EVAL_CONFIG", `Cannot specify both "breakEvalOnSigint" and "eval" for REPL`);
    }
}
class ERR_INVALID_REPL_INPUT extends NodeTypeError {
    constructor(x51){
        super("ERR_INVALID_REPL_INPUT", `${x51}`);
    }
}
class ERR_INVALID_SYNC_FORK_INPUT extends NodeTypeError {
    constructor(x52){
        super("ERR_INVALID_SYNC_FORK_INPUT", `Asynchronous forks do not support Buffer, TypedArray, DataView or string input: ${x52}`);
    }
}
class ERR_INVALID_THIS extends NodeTypeError {
    constructor(x53){
        super("ERR_INVALID_THIS", `Value of "this" must be of type ${x53}`);
    }
}
class ERR_INVALID_TUPLE extends NodeTypeError {
    constructor(x54, y12){
        super("ERR_INVALID_TUPLE", `${x54} must be an iterable ${y12} tuple`);
    }
}
class ERR_INVALID_URI extends NodeURIError {
    constructor(){
        super("ERR_INVALID_URI", `URI malformed`);
    }
}
class ERR_IPC_CHANNEL_CLOSED extends NodeError {
    constructor(){
        super("ERR_IPC_CHANNEL_CLOSED", `Channel closed`);
    }
}
class ERR_IPC_DISCONNECTED extends NodeError {
    constructor(){
        super("ERR_IPC_DISCONNECTED", `IPC channel is already disconnected`);
    }
}
class ERR_IPC_ONE_PIPE extends NodeError {
    constructor(){
        super("ERR_IPC_ONE_PIPE", `Child process can have only one IPC pipe`);
    }
}
class ERR_IPC_SYNC_FORK extends NodeError {
    constructor(){
        super("ERR_IPC_SYNC_FORK", `IPC cannot be used with synchronous forks`);
    }
}
class ERR_MANIFEST_DEPENDENCY_MISSING extends NodeError {
    constructor(x55, y13){
        super("ERR_MANIFEST_DEPENDENCY_MISSING", `Manifest resource ${x55} does not list ${y13} as a dependency specifier`);
    }
}
class ERR_MANIFEST_INTEGRITY_MISMATCH extends NodeSyntaxError {
    constructor(x56){
        super("ERR_MANIFEST_INTEGRITY_MISMATCH", `Manifest resource ${x56} has multiple entries but integrity lists do not match`);
    }
}
class ERR_MANIFEST_INVALID_RESOURCE_FIELD extends NodeTypeError {
    constructor(x57, y14){
        super("ERR_MANIFEST_INVALID_RESOURCE_FIELD", `Manifest resource ${x57} has invalid property value for ${y14}`);
    }
}
class ERR_MANIFEST_TDZ extends NodeError {
    constructor(){
        super("ERR_MANIFEST_TDZ", `Manifest initialization has not yet run`);
    }
}
class ERR_MANIFEST_UNKNOWN_ONERROR extends NodeSyntaxError {
    constructor(x58){
        super("ERR_MANIFEST_UNKNOWN_ONERROR", `Manifest specified unknown error behavior "${x58}".`);
    }
}
class ERR_METHOD_NOT_IMPLEMENTED extends NodeError {
    constructor(x59){
        super("ERR_METHOD_NOT_IMPLEMENTED", `The ${x59} method is not implemented`);
    }
}
class ERR_MISSING_ARGS extends NodeTypeError {
    constructor(...args){
        args = args.map((a)=>`"${a}"`
        );
        let msg1 = "The ";
        switch(args.length){
            case 1:
                msg1 += `${args[0]} argument`;
                break;
            case 2:
                msg1 += `${args[0]} and ${args[1]} arguments`;
                break;
            default:
                msg1 += args.slice(0, args.length - 1).join(", ");
                msg1 += `, and ${args[args.length - 1]} arguments`;
                break;
        }
        super("ERR_MISSING_ARGS", `${msg1} must be specified`);
    }
}
class ERR_MISSING_OPTION extends NodeTypeError {
    constructor(x60){
        super("ERR_MISSING_OPTION", `${x60} is required`);
    }
}
class ERR_MULTIPLE_CALLBACK extends NodeError {
    constructor(){
        super("ERR_MULTIPLE_CALLBACK", `Callback called multiple times`);
    }
}
class ERR_NAPI_CONS_FUNCTION extends NodeTypeError {
    constructor(){
        super("ERR_NAPI_CONS_FUNCTION", `Constructor must be a function`);
    }
}
class ERR_NAPI_INVALID_DATAVIEW_ARGS extends NodeRangeError {
    constructor(){
        super("ERR_NAPI_INVALID_DATAVIEW_ARGS", `byte_offset + byte_length should be less than or equal to the size in bytes of the array passed in`);
    }
}
class ERR_NAPI_INVALID_TYPEDARRAY_ALIGNMENT extends NodeRangeError {
    constructor(x61, y15){
        super("ERR_NAPI_INVALID_TYPEDARRAY_ALIGNMENT", `start offset of ${x61} should be a multiple of ${y15}`);
    }
}
class ERR_NAPI_INVALID_TYPEDARRAY_LENGTH extends NodeRangeError {
    constructor(){
        super("ERR_NAPI_INVALID_TYPEDARRAY_LENGTH", `Invalid typed array length`);
    }
}
class ERR_NO_CRYPTO extends NodeError {
    constructor(){
        super("ERR_NO_CRYPTO", `Node.js is not compiled with OpenSSL crypto support`);
    }
}
class ERR_NO_ICU extends NodeTypeError {
    constructor(x62){
        super("ERR_NO_ICU", `${x62} is not supported on Node.js compiled without ICU`);
    }
}
class ERR_QUICCLIENTSESSION_FAILED extends NodeError {
    constructor(x63){
        super("ERR_QUICCLIENTSESSION_FAILED", `Failed to create a new QuicClientSession: ${x63}`);
    }
}
class ERR_QUICCLIENTSESSION_FAILED_SETSOCKET extends NodeError {
    constructor(){
        super("ERR_QUICCLIENTSESSION_FAILED_SETSOCKET", `Failed to set the QuicSocket`);
    }
}
class ERR_QUICSESSION_DESTROYED extends NodeError {
    constructor(x64){
        super("ERR_QUICSESSION_DESTROYED", `Cannot call ${x64} after a QuicSession has been destroyed`);
    }
}
class ERR_QUICSESSION_INVALID_DCID extends NodeError {
    constructor(x65){
        super("ERR_QUICSESSION_INVALID_DCID", `Invalid DCID value: ${x65}`);
    }
}
class ERR_QUICSESSION_UPDATEKEY extends NodeError {
    constructor(){
        super("ERR_QUICSESSION_UPDATEKEY", `Unable to update QuicSession keys`);
    }
}
class ERR_QUICSOCKET_DESTROYED extends NodeError {
    constructor(x66){
        super("ERR_QUICSOCKET_DESTROYED", `Cannot call ${x66} after a QuicSocket has been destroyed`);
    }
}
class ERR_QUICSOCKET_INVALID_STATELESS_RESET_SECRET_LENGTH extends NodeError {
    constructor(){
        super("ERR_QUICSOCKET_INVALID_STATELESS_RESET_SECRET_LENGTH", `The stateResetToken must be exactly 16-bytes in length`);
    }
}
class ERR_QUICSOCKET_LISTENING extends NodeError {
    constructor(){
        super("ERR_QUICSOCKET_LISTENING", `This QuicSocket is already listening`);
    }
}
class ERR_QUICSOCKET_UNBOUND extends NodeError {
    constructor(x67){
        super("ERR_QUICSOCKET_UNBOUND", `Cannot call ${x67} before a QuicSocket has been bound`);
    }
}
class ERR_QUICSTREAM_DESTROYED extends NodeError {
    constructor(x68){
        super("ERR_QUICSTREAM_DESTROYED", `Cannot call ${x68} after a QuicStream has been destroyed`);
    }
}
class ERR_QUICSTREAM_INVALID_PUSH extends NodeError {
    constructor(){
        super("ERR_QUICSTREAM_INVALID_PUSH", `Push streams are only supported on client-initiated, bidirectional streams`);
    }
}
class ERR_QUICSTREAM_OPEN_FAILED extends NodeError {
    constructor(){
        super("ERR_QUICSTREAM_OPEN_FAILED", `Opening a new QuicStream failed`);
    }
}
class ERR_QUICSTREAM_UNSUPPORTED_PUSH extends NodeError {
    constructor(){
        super("ERR_QUICSTREAM_UNSUPPORTED_PUSH", `Push streams are not supported on this QuicSession`);
    }
}
class ERR_QUIC_TLS13_REQUIRED extends NodeError {
    constructor(){
        super("ERR_QUIC_TLS13_REQUIRED", `QUIC requires TLS version 1.3`);
    }
}
class ERR_SCRIPT_EXECUTION_INTERRUPTED extends NodeError {
    constructor(){
        super("ERR_SCRIPT_EXECUTION_INTERRUPTED", "Script execution was interrupted by `SIGINT`");
    }
}
class ERR_SERVER_ALREADY_LISTEN extends NodeError {
    constructor(){
        super("ERR_SERVER_ALREADY_LISTEN", `Listen method has been called more than once without closing.`);
    }
}
class ERR_SERVER_NOT_RUNNING extends NodeError {
    constructor(){
        super("ERR_SERVER_NOT_RUNNING", `Server is not running.`);
    }
}
class ERR_SOCKET_ALREADY_BOUND extends NodeError {
    constructor(){
        super("ERR_SOCKET_ALREADY_BOUND", `Socket is already bound`);
    }
}
class ERR_SOCKET_BAD_BUFFER_SIZE extends NodeTypeError {
    constructor(){
        super("ERR_SOCKET_BAD_BUFFER_SIZE", `Buffer size must be a positive integer`);
    }
}
class ERR_SOCKET_BAD_TYPE extends NodeTypeError {
    constructor(){
        super("ERR_SOCKET_BAD_TYPE", `Bad socket type specified. Valid types are: udp4, udp6`);
    }
}
class ERR_SOCKET_CLOSED extends NodeError {
    constructor(){
        super("ERR_SOCKET_CLOSED", `Socket is closed`);
    }
}
class ERR_SOCKET_DGRAM_IS_CONNECTED extends NodeError {
    constructor(){
        super("ERR_SOCKET_DGRAM_IS_CONNECTED", `Already connected`);
    }
}
class ERR_SOCKET_DGRAM_NOT_CONNECTED extends NodeError {
    constructor(){
        super("ERR_SOCKET_DGRAM_NOT_CONNECTED", `Not connected`);
    }
}
class ERR_SOCKET_DGRAM_NOT_RUNNING extends NodeError {
    constructor(){
        super("ERR_SOCKET_DGRAM_NOT_RUNNING", `Not running`);
    }
}
class ERR_SRI_PARSE extends NodeSyntaxError {
    constructor(name6, __char, position){
        super("ERR_SRI_PARSE", `Subresource Integrity string ${name6} had an unexpected ${__char} at position ${position}`);
    }
}
class ERR_STREAM_ALREADY_FINISHED extends NodeError {
    constructor(x69){
        super("ERR_STREAM_ALREADY_FINISHED", `Cannot call ${x69} after a stream was finished`);
    }
}
class ERR_STREAM_CANNOT_PIPE extends NodeError {
    constructor(){
        super("ERR_STREAM_CANNOT_PIPE", `Cannot pipe, not readable`);
    }
}
class ERR_STREAM_DESTROYED extends NodeError {
    constructor(x70){
        super("ERR_STREAM_DESTROYED", `Cannot call ${x70} after a stream was destroyed`);
    }
}
class ERR_STREAM_NULL_VALUES extends NodeTypeError {
    constructor(){
        super("ERR_STREAM_NULL_VALUES", `May not write null values to stream`);
    }
}
class ERR_STREAM_PREMATURE_CLOSE extends NodeError {
    constructor(){
        super("ERR_STREAM_PREMATURE_CLOSE", `Premature close`);
    }
}
class ERR_STREAM_PUSH_AFTER_EOF extends NodeError {
    constructor(){
        super("ERR_STREAM_PUSH_AFTER_EOF", `stream.push() after EOF`);
    }
}
class ERR_STREAM_UNSHIFT_AFTER_END_EVENT extends NodeError {
    constructor(){
        super("ERR_STREAM_UNSHIFT_AFTER_END_EVENT", `stream.unshift() after end event`);
    }
}
class ERR_STREAM_WRAP extends NodeError {
    constructor(){
        super("ERR_STREAM_WRAP", `Stream has StringDecoder set or is in objectMode`);
    }
}
class ERR_STREAM_WRITE_AFTER_END extends NodeError {
    constructor(){
        super("ERR_STREAM_WRITE_AFTER_END", `write after end`);
    }
}
class ERR_SYNTHETIC extends NodeError {
    constructor(){
        super("ERR_SYNTHETIC", `JavaScript Callstack`);
    }
}
class ERR_TLS_DH_PARAM_SIZE extends NodeError {
    constructor(x71){
        super("ERR_TLS_DH_PARAM_SIZE", `DH parameter size ${x71} is less than 2048`);
    }
}
class ERR_TLS_HANDSHAKE_TIMEOUT extends NodeError {
    constructor(){
        super("ERR_TLS_HANDSHAKE_TIMEOUT", `TLS handshake timeout`);
    }
}
class ERR_TLS_INVALID_CONTEXT extends NodeTypeError {
    constructor(x72){
        super("ERR_TLS_INVALID_CONTEXT", `${x72} must be a SecureContext`);
    }
}
class ERR_TLS_INVALID_STATE extends NodeError {
    constructor(){
        super("ERR_TLS_INVALID_STATE", `TLS socket connection must be securely established`);
    }
}
class ERR_TLS_INVALID_PROTOCOL_VERSION extends NodeTypeError {
    constructor(protocol, x73){
        super("ERR_TLS_INVALID_PROTOCOL_VERSION", `${protocol} is not a valid ${x73} TLS protocol version`);
    }
}
class ERR_TLS_PROTOCOL_VERSION_CONFLICT extends NodeTypeError {
    constructor(prevProtocol, protocol1){
        super("ERR_TLS_PROTOCOL_VERSION_CONFLICT", `TLS protocol version ${prevProtocol} conflicts with secureProtocol ${protocol1}`);
    }
}
class ERR_TLS_RENEGOTIATION_DISABLED extends NodeError {
    constructor(){
        super("ERR_TLS_RENEGOTIATION_DISABLED", `TLS session renegotiation disabled for this socket`);
    }
}
class ERR_TLS_REQUIRED_SERVER_NAME extends NodeError {
    constructor(){
        super("ERR_TLS_REQUIRED_SERVER_NAME", `"servername" is required parameter for Server.addContext`);
    }
}
class ERR_TLS_SESSION_ATTACK extends NodeError {
    constructor(){
        super("ERR_TLS_SESSION_ATTACK", `TLS session renegotiation attack detected`);
    }
}
class ERR_TLS_SNI_FROM_SERVER extends NodeError {
    constructor(){
        super("ERR_TLS_SNI_FROM_SERVER", `Cannot issue SNI from a TLS server-side socket`);
    }
}
class ERR_TRACE_EVENTS_CATEGORY_REQUIRED extends NodeTypeError {
    constructor(){
        super("ERR_TRACE_EVENTS_CATEGORY_REQUIRED", `At least one category is required`);
    }
}
class ERR_TRACE_EVENTS_UNAVAILABLE extends NodeError {
    constructor(){
        super("ERR_TRACE_EVENTS_UNAVAILABLE", `Trace events are unavailable`);
    }
}
class ERR_UNAVAILABLE_DURING_EXIT extends NodeError {
    constructor(){
        super("ERR_UNAVAILABLE_DURING_EXIT", `Cannot call function in process exit handler`);
    }
}
class ERR_UNCAUGHT_EXCEPTION_CAPTURE_ALREADY_SET extends NodeError {
    constructor(){
        super("ERR_UNCAUGHT_EXCEPTION_CAPTURE_ALREADY_SET", "`process.setupUncaughtExceptionCapture()` was called while a capture callback was already active");
    }
}
class ERR_UNESCAPED_CHARACTERS extends NodeTypeError {
    constructor(x74){
        super("ERR_UNESCAPED_CHARACTERS", `${x74} contains unescaped characters`);
    }
}
class ERR_UNKNOWN_BUILTIN_MODULE extends NodeError {
    constructor(x75){
        super("ERR_UNKNOWN_BUILTIN_MODULE", `No such built-in module: ${x75}`);
    }
}
class ERR_UNKNOWN_CREDENTIAL extends NodeError {
    constructor(x76, y16){
        super("ERR_UNKNOWN_CREDENTIAL", `${x76} identifier does not exist: ${y16}`);
    }
}
class ERR_UNKNOWN_ENCODING extends NodeTypeError {
    constructor(x77){
        super("ERR_UNKNOWN_ENCODING", `Unknown encoding: ${x77}`);
    }
}
class ERR_UNKNOWN_FILE_EXTENSION extends NodeTypeError {
    constructor(x78, y17){
        super("ERR_UNKNOWN_FILE_EXTENSION", `Unknown file extension "${x78}" for ${y17}`);
    }
}
class ERR_UNKNOWN_MODULE_FORMAT extends NodeRangeError {
    constructor(x79){
        super("ERR_UNKNOWN_MODULE_FORMAT", `Unknown module format: ${x79}`);
    }
}
class ERR_UNKNOWN_SIGNAL extends NodeTypeError {
    constructor(x80){
        super("ERR_UNKNOWN_SIGNAL", `Unknown signal: ${x80}`);
    }
}
class ERR_UNSUPPORTED_DIR_IMPORT extends NodeError {
    constructor(x81, y18){
        super("ERR_UNSUPPORTED_DIR_IMPORT", `Directory import '${x81}' is not supported resolving ES modules, imported from ${y18}`);
    }
}
class ERR_UNSUPPORTED_ESM_URL_SCHEME extends NodeError {
    constructor(){
        super("ERR_UNSUPPORTED_ESM_URL_SCHEME", `Only file and data URLs are supported by the default ESM loader`);
    }
}
class ERR_V8BREAKITERATOR extends NodeError {
    constructor(){
        super("ERR_V8BREAKITERATOR", `Full ICU data not installed. See https://github.com/nodejs/node/wiki/Intl`);
    }
}
class ERR_VALID_PERFORMANCE_ENTRY_TYPE extends NodeError {
    constructor(){
        super("ERR_VALID_PERFORMANCE_ENTRY_TYPE", `At least one valid performance entry type is required`);
    }
}
class ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING extends NodeTypeError {
    constructor(){
        super("ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING", `A dynamic import callback was not specified.`);
    }
}
class ERR_VM_MODULE_ALREADY_LINKED extends NodeError {
    constructor(){
        super("ERR_VM_MODULE_ALREADY_LINKED", `Module has already been linked`);
    }
}
class ERR_VM_MODULE_CANNOT_CREATE_CACHED_DATA extends NodeError {
    constructor(){
        super("ERR_VM_MODULE_CANNOT_CREATE_CACHED_DATA", `Cached data cannot be created for a module which has been evaluated`);
    }
}
class ERR_VM_MODULE_DIFFERENT_CONTEXT extends NodeError {
    constructor(){
        super("ERR_VM_MODULE_DIFFERENT_CONTEXT", `Linked modules must use the same context`);
    }
}
class ERR_VM_MODULE_LINKING_ERRORED extends NodeError {
    constructor(){
        super("ERR_VM_MODULE_LINKING_ERRORED", `Linking has already failed for the provided module`);
    }
}
class ERR_VM_MODULE_NOT_MODULE extends NodeError {
    constructor(){
        super("ERR_VM_MODULE_NOT_MODULE", `Provided module is not an instance of Module`);
    }
}
class ERR_VM_MODULE_STATUS extends NodeError {
    constructor(x82){
        super("ERR_VM_MODULE_STATUS", `Module status ${x82}`);
    }
}
class ERR_WASI_ALREADY_STARTED extends NodeError {
    constructor(){
        super("ERR_WASI_ALREADY_STARTED", `WASI instance has already started`);
    }
}
class ERR_WORKER_INIT_FAILED extends NodeError {
    constructor(x83){
        super("ERR_WORKER_INIT_FAILED", `Worker initialization failure: ${x83}`);
    }
}
class ERR_WORKER_NOT_RUNNING extends NodeError {
    constructor(){
        super("ERR_WORKER_NOT_RUNNING", `Worker instance not running`);
    }
}
class ERR_WORKER_OUT_OF_MEMORY extends NodeError {
    constructor(x84){
        super("ERR_WORKER_OUT_OF_MEMORY", `Worker terminated due to reaching memory limit: ${x84}`);
    }
}
class ERR_WORKER_UNSERIALIZABLE_ERROR extends NodeError {
    constructor(){
        super("ERR_WORKER_UNSERIALIZABLE_ERROR", `Serializing an uncaught exception failed`);
    }
}
class ERR_WORKER_UNSUPPORTED_EXTENSION extends NodeTypeError {
    constructor(x85){
        super("ERR_WORKER_UNSUPPORTED_EXTENSION", `The worker script extension must be ".js", ".mjs", or ".cjs". Received "${x85}"`);
    }
}
class ERR_WORKER_UNSUPPORTED_OPERATION extends NodeTypeError {
    constructor(x86){
        super("ERR_WORKER_UNSUPPORTED_OPERATION", `${x86} is not supported in workers`);
    }
}
class ERR_ZLIB_INITIALIZATION_FAILED extends NodeError {
    constructor(){
        super("ERR_ZLIB_INITIALIZATION_FAILED", `Initialization failed`);
    }
}
class ERR_FALSY_VALUE_REJECTION extends NodeError {
    reason;
    constructor(reason3){
        super("ERR_FALSY_VALUE_REJECTION", "Promise was rejected with falsy value");
        this.reason = reason3;
    }
}
class ERR_HTTP2_INVALID_SETTING_VALUE extends NodeRangeError {
    actual;
    min;
    max;
    constructor(name7, actual2, min1, max1){
        super("ERR_HTTP2_INVALID_SETTING_VALUE", `Invalid value for setting "${name7}": ${actual2}`);
        this.actual = actual2;
        if (min1 !== undefined) {
            this.min = min1;
            this.max = max1;
        }
    }
}
class ERR_HTTP2_STREAM_CANCEL extends NodeError {
    cause;
    constructor(error){
        super("ERR_HTTP2_STREAM_CANCEL", typeof error.message === "string" ? `The pending stream has been canceled (caused by: ${error.message})` : "The pending stream has been canceled");
        if (error) {
            this.cause = error;
        }
    }
}
class ERR_INVALID_ADDRESS_FAMILY extends NodeRangeError {
    host;
    port;
    constructor(addressType, host1, port1){
        super("ERR_INVALID_ADDRESS_FAMILY", `Invalid address family: ${addressType} ${host1}:${port1}`);
        this.host = host1;
        this.port = port1;
    }
}
class ERR_INVALID_CHAR extends NodeTypeError {
    constructor(name8, field){
        super("ERR_INVALID_CHAR", field ? `Invalid character in ${name8}` : `Invalid character in ${name8} ["${field}"]`);
    }
}
class ERR_INVALID_OPT_VALUE extends NodeTypeError {
    constructor(name9, value2){
        super("ERR_INVALID_OPT_VALUE", `The value "${value2}" is invalid for option "${name9}"`);
    }
}
class ERR_INVALID_RETURN_PROPERTY extends NodeTypeError {
    constructor(input3, name10, prop, value3){
        super("ERR_INVALID_RETURN_PROPERTY", `Expected a valid ${input3} to be returned for the "${prop}" from the "${name10}" function but got ${value3}.`);
    }
}
function buildReturnPropertyType(value) {
    if (value && value.constructor && value.constructor.name) {
        return `instance of ${value.constructor.name}`;
    } else {
        return `type ${typeof value}`;
    }
}
class ERR_INVALID_RETURN_PROPERTY_VALUE extends NodeTypeError {
    constructor(input1, name11, prop1, value4){
        super("ERR_INVALID_RETURN_PROPERTY_VALUE", `Expected ${input1} to be returned for the "${prop1}" from the "${name11}" function but got ${buildReturnPropertyType(value4)}.`);
    }
}
class ERR_INVALID_RETURN_VALUE extends NodeTypeError {
    constructor(input2, name12, value5){
        super("ERR_INVALID_RETURN_VALUE", `Expected ${input2} to be returned from the "${name12}" function but got ${buildReturnPropertyType(value5)}.`);
    }
}
class ERR_INVALID_URL extends NodeTypeError {
    input;
    constructor(input4){
        super("ERR_INVALID_URL", `Invalid URL: ${input4}`);
        this.input = input4;
    }
}
function ensureArray(maybeArray) {
    return Array.isArray(maybeArray) ? maybeArray : [
        maybeArray
    ];
}
function createIterResult(value, done) {
    return {
        value,
        done
    };
}
let defaultMaxListeners = 10;
function validateMaxListeners(n, name) {
    if (!Number.isInteger(n) || n < 0) {
        throw new ERR_OUT_OF_RANGE(name, "a non-negative number", inspect(n));
    }
}
class EventEmitter {
    static captureRejectionSymbol = Symbol.for("nodejs.rejection");
    static errorMonitor = Symbol("events.errorMonitor");
    static get defaultMaxListeners() {
        return defaultMaxListeners;
    }
    static set defaultMaxListeners(value) {
        validateMaxListeners(value, "defaultMaxListeners");
        defaultMaxListeners = value;
    }
    maxListeners;
    _events;
    constructor(){
        this._events = Object.create(null);
    }
    _addListener(eventName, listener, prepend) {
        this.checkListenerArgument(listener);
        this.emit("newListener", eventName, this.unwrapListener(listener));
        if (this.hasListeners(eventName)) {
            let listeners = this._events[eventName];
            if (!Array.isArray(listeners)) {
                listeners = [
                    listeners
                ];
                this._events[eventName] = listeners;
            }
            if (prepend) {
                listeners.unshift(listener);
            } else {
                listeners.push(listener);
            }
        } else {
            this._events[eventName] = listener;
        }
        const max = this.getMaxListeners();
        if (max > 0 && this.listenerCount(eventName) > max) {
            const warning = new MaxListenersExceededWarning(this, eventName);
            this.warnIfNeeded(eventName, warning);
        }
        return this;
    }
    addListener(eventName, listener) {
        return this._addListener(eventName, listener, false);
    }
    emit(eventName, ...args) {
        if (this.hasListeners(eventName)) {
            if (eventName === "error" && this.hasListeners(EventEmitter.errorMonitor)) {
                this.emit(EventEmitter.errorMonitor, ...args);
            }
            const listeners = ensureArray(this._events[eventName]).slice();
            for (const listener of listeners){
                try {
                    listener.apply(this, args);
                } catch (err) {
                    this.emit("error", err);
                }
            }
            return true;
        } else if (eventName === "error") {
            if (this.hasListeners(EventEmitter.errorMonitor)) {
                this.emit(EventEmitter.errorMonitor, ...args);
            }
            const errMsg = args.length > 0 ? args[0] : Error("Unhandled error.");
            throw errMsg;
        }
        return false;
    }
    eventNames() {
        return Reflect.ownKeys(this._events);
    }
    getMaxListeners() {
        return this.maxListeners == null ? EventEmitter.defaultMaxListeners : this.maxListeners;
    }
    listenerCount(eventName) {
        if (this.hasListeners(eventName)) {
            const maybeListeners = this._events[eventName];
            return Array.isArray(maybeListeners) ? maybeListeners.length : 1;
        } else {
            return 0;
        }
    }
    static listenerCount(emitter, eventName) {
        return emitter.listenerCount(eventName);
    }
    _listeners(target, eventName, unwrap) {
        if (!target.hasListeners(eventName)) {
            return [];
        }
        const eventListeners = target._events[eventName];
        if (Array.isArray(eventListeners)) {
            return unwrap ? this.unwrapListeners(eventListeners) : eventListeners.slice(0);
        } else {
            return [
                unwrap ? this.unwrapListener(eventListeners) : eventListeners, 
            ];
        }
    }
    unwrapListeners(arr) {
        const unwrappedListeners = new Array(arr.length);
        for(let i = 0; i < arr.length; i++){
            unwrappedListeners[i] = this.unwrapListener(arr[i]);
        }
        return unwrappedListeners;
    }
    unwrapListener(listener) {
        return listener["listener"] ?? listener;
    }
    listeners(eventName) {
        return this._listeners(this, eventName, true);
    }
    rawListeners(eventName) {
        return this._listeners(this, eventName, false);
    }
    off(eventName, listener) {
    }
    on(eventName, listener) {
    }
    once(eventName, listener) {
        const wrapped = this.onceWrap(eventName, listener);
        this.on(eventName, wrapped);
        return this;
    }
    onceWrap(eventName, listener) {
        this.checkListenerArgument(listener);
        const wrapper = function(...args) {
            if (this.isCalled) {
                return;
            }
            this.context.removeListener(this.eventName, this.listener);
            this.isCalled = true;
            return this.listener.apply(this.context, args);
        };
        const wrapperContext = {
            eventName: eventName,
            listener: listener,
            rawListener: wrapper,
            context: this
        };
        const wrapped = wrapper.bind(wrapperContext);
        wrapperContext.rawListener = wrapped;
        wrapped.listener = listener;
        return wrapped;
    }
    prependListener(eventName, listener) {
        return this._addListener(eventName, listener, true);
    }
    prependOnceListener(eventName, listener) {
        const wrapped = this.onceWrap(eventName, listener);
        this.prependListener(eventName, wrapped);
        return this;
    }
    removeAllListeners(eventName) {
        if (this._events === undefined) {
            return this;
        }
        if (eventName) {
            if (this.hasListeners(eventName)) {
                const listeners = ensureArray(this._events[eventName]).slice().reverse();
                for (const listener of listeners){
                    this.removeListener(eventName, this.unwrapListener(listener));
                }
            }
        } else {
            const eventList = this.eventNames();
            eventList.forEach((eventName)=>{
                if (eventName === "removeListener") return;
                this.removeAllListeners(eventName);
            });
            this.removeAllListeners("removeListener");
        }
        return this;
    }
    removeListener(eventName, listener) {
        this.checkListenerArgument(listener);
        if (this.hasListeners(eventName)) {
            const maybeArr = this._events[eventName];
            assert(maybeArr);
            const arr = ensureArray(maybeArr);
            let listenerIndex = -1;
            for(let i = arr.length - 1; i >= 0; i--){
                if (arr[i] == listener || arr[i] && arr[i]["listener"] == listener) {
                    listenerIndex = i;
                    break;
                }
            }
            if (listenerIndex >= 0) {
                arr.splice(listenerIndex, 1);
                if (arr.length === 0) {
                    delete this._events[eventName];
                } else if (arr.length === 1) {
                    this._events[eventName] = arr[0];
                }
                if (this._events.removeListener) {
                    this.emit("removeListener", eventName, listener);
                }
            }
        }
        return this;
    }
    setMaxListeners(n) {
        if (n !== Infinity) {
            validateMaxListeners(n, "n");
        }
        this.maxListeners = n;
        return this;
    }
    static once(emitter, name) {
        return new Promise((resolve, reject)=>{
            if (emitter instanceof EventTarget) {
                emitter.addEventListener(name, (...args)=>{
                    resolve(args);
                }, {
                    once: true,
                    passive: false,
                    capture: false
                });
                return;
            } else if (emitter instanceof EventEmitter) {
                const eventListener = (...args)=>{
                    if (errorListener !== undefined) {
                        emitter.removeListener("error", errorListener);
                    }
                    resolve(args);
                };
                let errorListener;
                if (name !== "error") {
                    errorListener = (err)=>{
                        emitter.removeListener(name, eventListener);
                        reject(err);
                    };
                    emitter.once("error", errorListener);
                }
                emitter.once(name, eventListener);
                return;
            }
        });
    }
    static on(emitter, event) {
        const unconsumedEventValues = [];
        const unconsumedPromises = [];
        let error = null;
        let finished = false;
        const iterator = {
            next () {
                const value = unconsumedEventValues.shift();
                if (value) {
                    return Promise.resolve(createIterResult(value, false));
                }
                if (error) {
                    const p = Promise.reject(error);
                    error = null;
                    return p;
                }
                if (finished) {
                    return Promise.resolve(createIterResult(undefined, true));
                }
                return new Promise(function(resolve, reject) {
                    unconsumedPromises.push({
                        resolve,
                        reject
                    });
                });
            },
            return () {
                emitter.removeListener(event, eventHandler);
                emitter.removeListener("error", errorHandler);
                finished = true;
                for (const promise of unconsumedPromises){
                    promise.resolve(createIterResult(undefined, true));
                }
                return Promise.resolve(createIterResult(undefined, true));
            },
            throw (err) {
                error = err;
                emitter.removeListener(event, eventHandler);
                emitter.removeListener("error", errorHandler);
            },
            [Symbol.asyncIterator] () {
                return this;
            }
        };
        emitter.on(event, eventHandler);
        emitter.on("error", errorHandler);
        return iterator;
        function eventHandler(...args) {
            const promise = unconsumedPromises.shift();
            if (promise) {
                promise.resolve(createIterResult(args, false));
            } else {
                unconsumedEventValues.push(args);
            }
        }
        function errorHandler(err) {
            finished = true;
            const toError = unconsumedPromises.shift();
            if (toError) {
                toError.reject(err);
            } else {
                error = err;
            }
            iterator.return();
        }
    }
    checkListenerArgument(listener) {
        if (typeof listener !== "function") {
            throw new ERR_INVALID_ARG_TYPE("listener", "function", listener);
        }
    }
    warnIfNeeded(eventName, warning) {
        const listeners = this._events[eventName];
        if (listeners.warned) {
            return;
        }
        listeners.warned = true;
        console.warn(warning);
        const maybeProcess = globalThis.process;
        if (maybeProcess instanceof EventEmitter) {
            maybeProcess.emit("warning", warning);
        }
    }
    hasListeners(eventName) {
        return this._events && Boolean(this._events[eventName]);
    }
}
EventEmitter.prototype.on = EventEmitter.prototype.addListener;
EventEmitter.prototype.off = EventEmitter.prototype.removeListener;
class MaxListenersExceededWarning extends Error {
    emitter;
    type;
    count;
    constructor(emitter1, type2){
        const listenerCount = emitter1.listenerCount(type2);
        const message8 = "Possible EventEmitter memory leak detected. " + `${listenerCount} ${type2 == null ? "null" : type2.toString()} listeners added to [${emitter1.constructor.name}]. ` + " Use emitter.setMaxListeners() to increase limit";
        super(message8);
        this.emitter = emitter1;
        this.type = type2;
        this.count = listenerCount;
        this.name = "MaxListenersExceededWarning";
    }
}
class Crc32Stream {
    bytes = [];
    poly = 3988292384;
    crc = 0 ^ -1;
    encoder = new TextEncoder();
    #crc32 = "";
    constructor(){
        this.reset();
    }
    get crc32() {
        return this.#crc32;
    }
    reset() {
        this.#crc32 = "";
        this.crc = 0 ^ -1;
        for(let n = 0; n < 256; n += 1){
            let c = n;
            for(let k = 0; k < 8; k += 1){
                if (c & 1) {
                    c = this.poly ^ c >>> 1;
                } else {
                    c = c >>> 1;
                }
            }
            this.bytes[n] = c >>> 0;
        }
    }
    append(arr) {
        if (typeof arr === "string") {
            arr = this.encoder.encode(arr);
        }
        let crc = this.crc;
        for(let i = 0, l = arr.length; i < l; i += 1){
            crc = crc >>> 8 ^ this.bytes[(crc ^ arr[i]) & 255];
        }
        this.crc = crc;
        this.#crc32 = numberToHex(crc ^ -1);
        return this.#crc32;
    }
}
function numberToHex(n) {
    return (n >>> 0).toString(16);
}
const message9 = {
    2: "need dictionary",
    1: "stream end",
    0: "",
    "-1": "file error",
    "-2": "stream error",
    "-3": "data error",
    "-4": "insufficient memory",
    "-5": "buffer error",
    "-6": "incompatible version"
};
function zero(buf) {
    buf.fill(0, 0, buf.length);
}
const LITERALS = 256;
const L_CODES = 256 + 1 + 29;
const D_CODES = 30;
const BL_CODES = 19;
const HEAP_SIZE = 2 * L_CODES + 1;
const MAX_BITS = 15;
const Buf_size = 16;
const MAX_BL_BITS = 7;
const END_BLOCK = 256;
const extra_lbits = [
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    1,
    1,
    1,
    1,
    2,
    2,
    2,
    2,
    3,
    3,
    3,
    3,
    4,
    4,
    4,
    4,
    5,
    5,
    5,
    5,
    0, 
];
const extra_dbits = [
    0,
    0,
    0,
    0,
    1,
    1,
    2,
    2,
    3,
    3,
    4,
    4,
    5,
    5,
    6,
    6,
    7,
    7,
    8,
    8,
    9,
    9,
    10,
    10,
    11,
    11,
    12,
    12,
    13,
    13, 
];
const extra_blbits = [
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    2,
    3,
    7
];
const bl_order = [
    16,
    17,
    18,
    0,
    8,
    7,
    9,
    6,
    10,
    5,
    11,
    4,
    12,
    3,
    13,
    2,
    14,
    1,
    15, 
];
const static_ltree = new Array((L_CODES + 2) * 2);
zero(static_ltree);
const static_dtree = new Array(30 * 2);
zero(static_dtree);
const _dist_code = new Array(512);
zero(_dist_code);
const _length_code = new Array(258 - 3 + 1);
zero(_length_code);
const base_length = new Array(29);
zero(base_length);
const base_dist = new Array(30);
zero(base_dist);
class StaticTreeDesc {
    static_tree;
    extra_bits;
    extra_base;
    elems;
    max_length;
    has_stree;
    constructor(static_tree1, extra_bits1, extra_base1, elems1, max_length1){
        this.static_tree = static_tree1;
        this.extra_bits = extra_bits1;
        this.extra_base = extra_base1;
        this.elems = elems1;
        this.max_length = max_length1;
        this.has_stree = static_tree1 && static_tree1.length;
    }
}
let static_l_desc;
let static_d_desc;
let static_bl_desc;
class TreeDesc {
    dyn_tree;
    max_code;
    stat_desc;
    constructor(dyn_tree1, stat_desc1){
        this.dyn_tree = dyn_tree1;
        this.max_code = 0;
        this.stat_desc = stat_desc1;
    }
}
function d_code(dist) {
    return dist < 256 ? _dist_code[dist] : _dist_code[256 + (dist >>> 7)];
}
function put_short(s, w) {
    s.pending_buf[s.pending++] = w & 255;
    s.pending_buf[s.pending++] = w >>> 8 & 255;
}
function send_bits(s, value, length) {
    if (s.bi_valid > 16 - length) {
        s.bi_buf |= value << s.bi_valid & 65535;
        put_short(s, s.bi_buf);
        s.bi_buf = value >> Buf_size - s.bi_valid;
        s.bi_valid += length - Buf_size;
    } else {
        s.bi_buf |= value << s.bi_valid & 65535;
        s.bi_valid += length;
    }
}
function send_code(s, c, tree) {
    send_bits(s, tree[c * 2], tree[c * 2 + 1]);
}
function bi_reverse(code, len) {
    let res = 0;
    do {
        res |= code & 1;
        code >>>= 1;
        res <<= 1;
    }while (--len > 0)
    return res >>> 1;
}
function bi_flush(s) {
    if (s.bi_valid === 16) {
        put_short(s, s.bi_buf);
        s.bi_buf = 0;
        s.bi_valid = 0;
    } else if (s.bi_valid >= 8) {
        s.pending_buf[s.pending++] = s.bi_buf & 255;
        s.bi_buf >>= 8;
        s.bi_valid -= 8;
    }
}
function gen_bitlen(s, desc) {
    let tree = desc.dyn_tree;
    let max_code = desc.max_code;
    let stree = desc.stat_desc.static_tree;
    let has_stree = desc.stat_desc.has_stree;
    let extra = desc.stat_desc.extra_bits;
    let base = desc.stat_desc.extra_base;
    let max_length = desc.stat_desc.max_length;
    let h;
    let n, m;
    let bits;
    let xbits;
    let f;
    let overflow = 0;
    for(bits = 0; bits <= 15; bits++){
        s.bl_count[bits] = 0;
    }
    tree[s.heap[s.heap_max] * 2 + 1] = 0;
    for(h = s.heap_max + 1; h < HEAP_SIZE; h++){
        n = s.heap[h];
        bits = tree[tree[n * 2 + 1] * 2 + 1] + 1;
        if (bits > max_length) {
            bits = max_length;
            overflow++;
        }
        tree[n * 2 + 1] = bits;
        if (n > max_code) continue;
        s.bl_count[bits]++;
        xbits = 0;
        if (n >= base) {
            xbits = extra[n - base];
        }
        f = tree[n * 2];
        s.opt_len += f * (bits + xbits);
        if (has_stree) {
            s.static_len += f * (stree[n * 2 + 1] + xbits);
        }
    }
    if (overflow === 0) return;
    do {
        bits = max_length - 1;
        while(s.bl_count[bits] === 0)bits--;
        s.bl_count[bits]--;
        s.bl_count[bits + 1] += 2;
        s.bl_count[max_length]--;
        overflow -= 2;
    }while (overflow > 0)
    for(bits = max_length; bits !== 0; bits--){
        n = s.bl_count[bits];
        while(n !== 0){
            m = s.heap[--h];
            if (m > max_code) continue;
            if (tree[m * 2 + 1] !== bits) {
                s.opt_len += (bits - tree[m * 2 + 1]) * tree[m * 2];
                tree[m * 2 + 1] = bits;
            }
            n--;
        }
    }
}
function gen_codes(tree, max_code, bl_count) {
    let next_code = new Array(15 + 1);
    let code = 0;
    let bits;
    let n;
    for(bits = 1; bits <= 15; bits++){
        next_code[bits] = code = code + bl_count[bits - 1] << 1;
    }
    for(n = 0; n <= max_code; n++){
        let len = tree[n * 2 + 1];
        if (len === 0) continue;
        tree[n * 2] = bi_reverse(next_code[len]++, len);
    }
}
function tr_static_init() {
    let n;
    let bits;
    let length;
    let code;
    let dist;
    let bl_count = new Array(15 + 1);
    length = 0;
    for(code = 0; code < 29 - 1; code++){
        base_length[code] = length;
        for(n = 0; n < 1 << extra_lbits[code]; n++){
            _length_code[length++] = code;
        }
    }
    _length_code[length - 1] = code;
    dist = 0;
    for(code = 0; code < 16; code++){
        base_dist[code] = dist;
        for(n = 0; n < 1 << extra_dbits[code]; n++){
            _dist_code[dist++] = code;
        }
    }
    dist >>= 7;
    for(; code < 30; code++){
        base_dist[code] = dist << 7;
        for(n = 0; n < 1 << extra_dbits[code] - 7; n++){
            _dist_code[256 + dist++] = code;
        }
    }
    for(bits = 0; bits <= 15; bits++){
        bl_count[bits] = 0;
    }
    n = 0;
    while(n <= 143){
        static_ltree[n * 2 + 1] = 8;
        n++;
        bl_count[8]++;
    }
    while(n <= 255){
        static_ltree[n * 2 + 1] = 9;
        n++;
        bl_count[9]++;
    }
    while(n <= 279){
        static_ltree[n * 2 + 1] = 7;
        n++;
        bl_count[7]++;
    }
    while(n <= 287){
        static_ltree[n * 2 + 1] = 8;
        n++;
        bl_count[8]++;
    }
    gen_codes(static_ltree, L_CODES + 1, bl_count);
    for(n = 0; n < 30; n++){
        static_dtree[n * 2 + 1] = 5;
        static_dtree[n * 2] = bi_reverse(n, 5);
    }
    static_l_desc = new StaticTreeDesc(static_ltree, extra_lbits, LITERALS + 1, L_CODES, MAX_BITS);
    static_d_desc = new StaticTreeDesc(static_dtree, extra_dbits, 0, D_CODES, MAX_BITS);
    static_bl_desc = new StaticTreeDesc(new Array(0), extra_blbits, 0, BL_CODES, MAX_BL_BITS);
}
function init_block(s) {
    let n;
    for(n = 0; n < L_CODES; n++)s.dyn_ltree[n * 2] = 0;
    for(n = 0; n < 30; n++)s.dyn_dtree[n * 2] = 0;
    for(n = 0; n < 19; n++)s.bl_tree[n * 2] = 0;
    s.dyn_ltree[END_BLOCK * 2] = 1;
    s.opt_len = s.static_len = 0;
    s.last_lit = s.matches = 0;
}
function bi_windup(s) {
    if (s.bi_valid > 8) {
        put_short(s, s.bi_buf);
    } else if (s.bi_valid > 0) {
        s.pending_buf[s.pending++] = s.bi_buf;
    }
    s.bi_buf = 0;
    s.bi_valid = 0;
}
function copy_block(s, buf, len, header) {
    bi_windup(s);
    if (header) {
        put_short(s, len);
        put_short(s, ~len);
    }
    s.pending_buf.set(s.window.subarray(buf, buf + len), s.pending);
    s.pending += len;
}
function smaller(tree, n, m, depth) {
    let _n2 = n * 2;
    let _m2 = m * 2;
    return tree[_n2] < tree[_m2] || tree[_n2] === tree[_m2] && depth[n] <= depth[m];
}
function pqdownheap(s, tree, k) {
    let v = s.heap[k];
    let j = k << 1;
    while(j <= s.heap_len){
        if (j < s.heap_len && smaller(tree, s.heap[j + 1], s.heap[j], s.depth)) {
            j++;
        }
        if (smaller(tree, v, s.heap[j], s.depth)) break;
        s.heap[k] = s.heap[j];
        k = j;
        j <<= 1;
    }
    s.heap[k] = v;
}
function compress_block(s, ltree, dtree) {
    let dist;
    let lc;
    let lx = 0;
    let code;
    let extra;
    if (s.last_lit !== 0) {
        do {
            dist = s.pending_buf[s.d_buf + lx * 2] << 8 | s.pending_buf[s.d_buf + lx * 2 + 1];
            lc = s.pending_buf[s.l_buf + lx];
            lx++;
            if (dist === 0) {
                send_code(s, lc, ltree);
            } else {
                code = _length_code[lc];
                send_code(s, code + 256 + 1, ltree);
                extra = extra_lbits[code];
                if (extra !== 0) {
                    lc -= base_length[code];
                    send_bits(s, lc, extra);
                }
                dist--;
                code = d_code(dist);
                send_code(s, code, dtree);
                extra = extra_dbits[code];
                if (extra !== 0) {
                    dist -= base_dist[code];
                    send_bits(s, dist, extra);
                }
            }
        }while (lx < s.last_lit)
    }
    send_code(s, 256, ltree);
}
function build_tree(s, desc) {
    let tree = desc.dyn_tree;
    let stree = desc.stat_desc.static_tree;
    let has_stree = desc.stat_desc.has_stree;
    let elems = desc.stat_desc.elems;
    let n, m;
    let max_code = -1;
    let node;
    s.heap_len = 0;
    s.heap_max = HEAP_SIZE;
    for(n = 0; n < elems; n++){
        if (tree[n * 2] !== 0) {
            s.heap[++s.heap_len] = max_code = n;
            s.depth[n] = 0;
        } else {
            tree[n * 2 + 1] = 0;
        }
    }
    while(s.heap_len < 2){
        node = s.heap[++s.heap_len] = max_code < 2 ? ++max_code : 0;
        tree[node * 2] = 1;
        s.depth[node] = 0;
        s.opt_len--;
        if (has_stree) {
            s.static_len -= stree[node * 2 + 1];
        }
    }
    desc.max_code = max_code;
    for(n = s.heap_len >> 1; n >= 1; n--)pqdownheap(s, tree, n);
    node = elems;
    do {
        n = s.heap[1];
        s.heap[1] = s.heap[s.heap_len--];
        pqdownheap(s, tree, 1);
        m = s.heap[1];
        s.heap[--s.heap_max] = n;
        s.heap[--s.heap_max] = m;
        tree[node * 2] = tree[n * 2] + tree[m * 2];
        s.depth[node] = (s.depth[n] >= s.depth[m] ? s.depth[n] : s.depth[m]) + 1;
        tree[n * 2 + 1] = tree[m * 2 + 1] = node;
        s.heap[1] = node++;
        pqdownheap(s, tree, 1);
    }while (s.heap_len >= 2)
    s.heap[--s.heap_max] = s.heap[1];
    gen_bitlen(s, desc);
    gen_codes(tree, max_code, s.bl_count);
}
function scan_tree(s, tree, max_code) {
    let n;
    let prevlen = -1;
    let curlen;
    let nextlen = tree[0 * 2 + 1];
    let count = 0;
    let max_count = 7;
    let min_count = 4;
    if (nextlen === 0) {
        max_count = 138;
        min_count = 3;
    }
    tree[(max_code + 1) * 2 + 1] = 65535;
    for(n = 0; n <= max_code; n++){
        curlen = nextlen;
        nextlen = tree[(n + 1) * 2 + 1];
        if (++count < max_count && curlen === nextlen) {
            continue;
        } else if (count < min_count) {
            s.bl_tree[curlen * 2] += count;
        } else if (curlen !== 0) {
            if (curlen !== prevlen) s.bl_tree[curlen * 2]++;
            s.bl_tree[16 * 2]++;
        } else if (count <= 10) {
            s.bl_tree[17 * 2]++;
        } else {
            s.bl_tree[18 * 2]++;
        }
        count = 0;
        prevlen = curlen;
        if (nextlen === 0) {
            max_count = 138;
            min_count = 3;
        } else if (curlen === nextlen) {
            max_count = 6;
            min_count = 3;
        } else {
            max_count = 7;
            min_count = 4;
        }
    }
}
function send_tree(s, tree, max_code) {
    let n;
    let prevlen = -1;
    let curlen;
    let nextlen = tree[0 * 2 + 1];
    let count = 0;
    let max_count = 7;
    let min_count = 4;
    if (nextlen === 0) {
        max_count = 138;
        min_count = 3;
    }
    for(n = 0; n <= max_code; n++){
        curlen = nextlen;
        nextlen = tree[(n + 1) * 2 + 1];
        if (++count < max_count && curlen === nextlen) {
            continue;
        } else if (count < min_count) {
            do {
                send_code(s, curlen, s.bl_tree);
            }while (--count !== 0)
        } else if (curlen !== 0) {
            if (curlen !== prevlen) {
                send_code(s, curlen, s.bl_tree);
                count--;
            }
            send_code(s, 16, s.bl_tree);
            send_bits(s, count - 3, 2);
        } else if (count <= 10) {
            send_code(s, 17, s.bl_tree);
            send_bits(s, count - 3, 3);
        } else {
            send_code(s, 18, s.bl_tree);
            send_bits(s, count - 11, 7);
        }
        count = 0;
        prevlen = curlen;
        if (nextlen === 0) {
            max_count = 138;
            min_count = 3;
        } else if (curlen === nextlen) {
            max_count = 6;
            min_count = 3;
        } else {
            max_count = 7;
            min_count = 4;
        }
    }
}
function build_bl_tree(s) {
    let max_blindex;
    scan_tree(s, s.dyn_ltree, s.l_desc.max_code);
    scan_tree(s, s.dyn_dtree, s.d_desc.max_code);
    build_tree(s, s.bl_desc);
    for(max_blindex = BL_CODES - 1; max_blindex >= 3; max_blindex--){
        if (s.bl_tree[bl_order[max_blindex] * 2 + 1] !== 0) {
            break;
        }
    }
    s.opt_len += 3 * (max_blindex + 1) + 5 + 5 + 4;
    return max_blindex;
}
function send_all_trees(s, lcodes, dcodes, blcodes) {
    let rank;
    send_bits(s, lcodes - 257, 5);
    send_bits(s, dcodes - 1, 5);
    send_bits(s, blcodes - 4, 4);
    for(rank = 0; rank < blcodes; rank++){
        send_bits(s, s.bl_tree[bl_order[rank] * 2 + 1], 3);
    }
    send_tree(s, s.dyn_ltree, lcodes - 1);
    send_tree(s, s.dyn_dtree, dcodes - 1);
}
function detect_data_type(s) {
    let black_mask = 4093624447;
    let n;
    for(n = 0; n <= 31; n++, black_mask >>>= 1){
        if (black_mask & 1 && s.dyn_ltree[n * 2] !== 0) {
            return 0;
        }
    }
    if (s.dyn_ltree[9 * 2] !== 0 || s.dyn_ltree[10 * 2] !== 0 || s.dyn_ltree[13 * 2] !== 0) {
        return 1;
    }
    for(n = 32; n < 256; n++){
        if (s.dyn_ltree[n * 2] !== 0) {
            return 1;
        }
    }
    return 0;
}
let static_init_done = false;
function _tr_init(s) {
    if (!static_init_done) {
        tr_static_init();
        static_init_done = true;
    }
    s.l_desc = new TreeDesc(s.dyn_ltree, static_l_desc);
    s.d_desc = new TreeDesc(s.dyn_dtree, static_d_desc);
    s.bl_desc = new TreeDesc(s.bl_tree, static_bl_desc);
    s.bi_buf = 0;
    s.bi_valid = 0;
    init_block(s);
}
function _tr_stored_block(s, buf, stored_len, last) {
    send_bits(s, (0 << 1) + (last ? 1 : 0), 3);
    copy_block(s, buf, stored_len, true);
}
function _tr_align(s) {
    send_bits(s, 1 << 1, 3);
    send_code(s, 256, static_ltree);
    bi_flush(s);
}
function _tr_flush_block(s, buf, stored_len, last) {
    let opt_lenb, static_lenb;
    let max_blindex = 0;
    if (s.level > 0) {
        if (s.strm.data_type === 2) {
            s.strm.data_type = detect_data_type(s);
        }
        build_tree(s, s.l_desc);
        build_tree(s, s.d_desc);
        max_blindex = build_bl_tree(s);
        opt_lenb = s.opt_len + 3 + 7 >>> 3;
        static_lenb = s.static_len + 3 + 7 >>> 3;
        if (static_lenb <= opt_lenb) opt_lenb = static_lenb;
    } else {
        opt_lenb = static_lenb = stored_len + 5;
    }
    if (stored_len + 4 <= opt_lenb && buf !== -1) {
        _tr_stored_block(s, buf, stored_len, last);
    } else if (s.strategy === 4 || static_lenb === opt_lenb) {
        send_bits(s, (1 << 1) + (last ? 1 : 0), 3);
        compress_block(s, static_ltree, static_dtree);
    } else {
        send_bits(s, (2 << 1) + (last ? 1 : 0), 3);
        send_all_trees(s, s.l_desc.max_code + 1, s.d_desc.max_code + 1, max_blindex + 1);
        compress_block(s, s.dyn_ltree, s.dyn_dtree);
    }
    init_block(s);
    if (last) {
        bi_windup(s);
    }
}
function _tr_tally(s, dist, lc) {
    s.pending_buf[s.d_buf + s.last_lit * 2] = dist >>> 8 & 255;
    s.pending_buf[s.d_buf + s.last_lit * 2 + 1] = dist & 255;
    s.pending_buf[s.l_buf + s.last_lit] = lc & 255;
    s.last_lit++;
    if (dist === 0) {
        s.dyn_ltree[lc * 2]++;
    } else {
        s.matches++;
        dist--;
        s.dyn_ltree[(_length_code[lc] + 256 + 1) * 2]++;
        s.dyn_dtree[d_code(dist) * 2]++;
    }
    return s.last_lit === s.lit_bufsize - 1;
}
function adler32(adler, buf, len, pos) {
    let s1 = adler & 65535 | 0;
    let s2 = adler >>> 16 & 65535 | 0;
    let n = 0;
    while(len !== 0){
        n = len > 2000 ? 2000 : len;
        len -= n;
        do {
            s1 = s1 + buf[pos++] | 0;
            s2 = s2 + s1 | 0;
        }while (--n)
        s1 %= 65521;
        s2 %= 65521;
    }
    return s1 | s2 << 16 | 0;
}
function makeTable() {
    let c;
    const table = [];
    const m = 3988292384;
    for(let n = 0; n < 256; n++){
        c = n;
        for(let k = 0; k < 8; k++){
            c = c & 1 ? m ^ c >>> 1 : c >>> 1;
        }
        table[n] = c;
    }
    return table;
}
const crcTable = makeTable();
function crc32(crc, buf, len, pos) {
    let t = crcTable;
    let end = pos + len;
    let f = 255;
    crc ^= -1;
    for(let i = pos; i < end; i++){
        crc = crc >>> 8 ^ t[(crc ^ buf[i]) & f];
    }
    return crc ^ -1;
}
var STATUS;
(function(STATUS) {
    STATUS[STATUS["Z_NO_FLUSH"] = 0] = "Z_NO_FLUSH";
    STATUS[STATUS["Z_PARTIAL_FLUSH"] = 1] = "Z_PARTIAL_FLUSH";
    STATUS[STATUS["Z_SYNC_FLUSH"] = 2] = "Z_SYNC_FLUSH";
    STATUS[STATUS["Z_FULL_FLUSH"] = 3] = "Z_FULL_FLUSH";
    STATUS[STATUS["Z_FINISH"] = 4] = "Z_FINISH";
    STATUS[STATUS["Z_BLOCK"] = 5] = "Z_BLOCK";
    STATUS[STATUS["Z_TREES"] = 6] = "Z_TREES";
    STATUS[STATUS["Z_OK"] = 0] = "Z_OK";
    STATUS[STATUS["Z_STREAM_END"] = 1] = "Z_STREAM_END";
    STATUS[STATUS["Z_NEED_DICT"] = 2] = "Z_NEED_DICT";
    STATUS[STATUS["Z_ERRNO"] = -1] = "Z_ERRNO";
    STATUS[STATUS["Z_STREAM_ERROR"] = -2] = "Z_STREAM_ERROR";
    STATUS[STATUS["Z_DATA_ERROR"] = -3] = "Z_DATA_ERROR";
    STATUS[STATUS["Z_BUF_ERROR"] = -5] = "Z_BUF_ERROR";
    STATUS[STATUS["Z_NO_COMPRESSION"] = 0] = "Z_NO_COMPRESSION";
    STATUS[STATUS["Z_BEST_SPEED"] = 1] = "Z_BEST_SPEED";
    STATUS[STATUS["Z_BEST_COMPRESSION"] = 9] = "Z_BEST_COMPRESSION";
    STATUS[STATUS["Z_DEFAULT_COMPRESSION"] = -1] = "Z_DEFAULT_COMPRESSION";
    STATUS[STATUS["Z_FILTERED"] = 1] = "Z_FILTERED";
    STATUS[STATUS["Z_HUFFMAN_ONLY"] = 2] = "Z_HUFFMAN_ONLY";
    STATUS[STATUS["Z_RLE"] = 3] = "Z_RLE";
    STATUS[STATUS["Z_FIXED"] = 4] = "Z_FIXED";
    STATUS[STATUS["Z_DEFAULT_STRATEGY"] = 0] = "Z_DEFAULT_STRATEGY";
    STATUS[STATUS["Z_BINARY"] = 0] = "Z_BINARY";
    STATUS[STATUS["Z_TEXT"] = 1] = "Z_TEXT";
    STATUS[STATUS["Z_UNKNOWN"] = 2] = "Z_UNKNOWN";
    STATUS[STATUS["Z_DEFLATED"] = 8] = "Z_DEFLATED";
})(STATUS || (STATUS = {
}));
const Z_STREAM_ERROR = -2;
const Z_DEFAULT_COMPRESSION = -1;
const Z_UNKNOWN = 2;
const L_CODES1 = 256 + 1 + 29;
const HEAP_SIZE1 = 2 * L_CODES1 + 1;
const MIN_MATCH = 3;
const MAX_MATCH = 258;
const MIN_LOOKAHEAD = 258 + 3 + 1;
const PRESET_DICT = 32;
const INIT_STATE = 42;
const EXTRA_STATE = 69;
const NAME_STATE = 73;
const COMMENT_STATE = 91;
const HCRC_STATE = 103;
const BUSY_STATE = 113;
const FINISH_STATE = 666;
function err1(strm, errorCode) {
    strm.msg = message9[errorCode];
    return errorCode;
}
function rank(f) {
    return (f << 1) - (f > 4 ? 9 : 0);
}
function zero1(buf) {
    buf.fill(0, 0, buf.length);
}
function flush_pending(strm) {
    let s = strm.state;
    let len = s.pending;
    if (len > strm.avail_out) {
        len = strm.avail_out;
    }
    if (len === 0) return;
    strm.output.set(s.pending_buf.subarray(s.pending_out, s.pending_out + len), strm.next_out);
    strm.next_out += len;
    s.pending_out += len;
    strm.total_out += len;
    strm.avail_out -= len;
    s.pending -= len;
    if (s.pending === 0) {
        s.pending_out = 0;
    }
}
function flush_block_only(s, last) {
    _tr_flush_block(s, s.block_start >= 0 ? s.block_start : -1, s.strstart - s.block_start, last);
    s.block_start = s.strstart;
    flush_pending(s.strm);
}
function put_byte(s, b) {
    s.pending_buf[s.pending++] = b;
}
function putShortMSB(s, b) {
    s.pending_buf[s.pending++] = b >>> 8 & 255;
    s.pending_buf[s.pending++] = b & 255;
}
function read_buf(strm, buf, start, size) {
    let len = strm.avail_in;
    if (len > size) len = size;
    if (len === 0) return 0;
    strm.avail_in -= len;
    buf.set(strm.input.subarray(strm.next_in, strm.next_in + len), start);
    if (strm.state.wrap === 1) {
        strm.adler = adler32(strm.adler, buf, len, start);
    } else if (strm.state.wrap === 2) {
        strm.adler = crc32(strm.adler, buf, len, start);
    }
    strm.next_in += len;
    strm.total_in += len;
    return len;
}
function longest_match(s, cur_match) {
    let chain_length = s.max_chain_length;
    let scan = s.strstart;
    let match;
    let len;
    let best_len = s.prev_length;
    let nice_match = s.nice_match;
    let limit = s.strstart > s.w_size - MIN_LOOKAHEAD ? s.strstart - (s.w_size - MIN_LOOKAHEAD) : 0;
    let _win = s.window;
    let wmask = s.w_mask;
    let prev = s.prev;
    let strend = s.strstart + 258;
    let scan_end1 = _win[scan + best_len - 1];
    let scan_end = _win[scan + best_len];
    if (s.prev_length >= s.good_match) {
        chain_length >>= 2;
    }
    if (nice_match > s.lookahead) nice_match = s.lookahead;
    do {
        match = cur_match;
        if (_win[match + best_len] !== scan_end || _win[match + best_len - 1] !== scan_end1 || _win[match] !== _win[scan] || _win[++match] !== _win[scan + 1]) {
            continue;
        }
        scan += 2;
        match++;
        do {
        }while (_win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && scan < strend)
        len = MAX_MATCH - (strend - scan);
        scan = strend - MAX_MATCH;
        if (len > best_len) {
            s.match_start = cur_match;
            best_len = len;
            if (len >= nice_match) {
                break;
            }
            scan_end1 = _win[scan + best_len - 1];
            scan_end = _win[scan + best_len];
        }
    }while ((cur_match = prev[cur_match & wmask]) > limit && --chain_length !== 0)
    if (best_len <= s.lookahead) {
        return best_len;
    }
    return s.lookahead;
}
function fill_window(s) {
    let _w_size = s.w_size;
    let p, n, m, more, str;
    do {
        more = s.window_size - s.lookahead - s.strstart;
        if (s.strstart >= _w_size + (_w_size - MIN_LOOKAHEAD)) {
            s.window.set(s.window.subarray(_w_size, _w_size + _w_size), 0);
            s.match_start -= _w_size;
            s.strstart -= _w_size;
            s.block_start -= _w_size;
            n = s.hash_size;
            p = n;
            do {
                m = s.head[--p];
                s.head[p] = m >= _w_size ? m - _w_size : 0;
            }while (--n)
            n = _w_size;
            p = n;
            do {
                m = s.prev[--p];
                s.prev[p] = m >= _w_size ? m - _w_size : 0;
            }while (--n)
            more += _w_size;
        }
        if (s.strm.avail_in === 0) {
            break;
        }
        n = read_buf(s.strm, s.window, s.strstart + s.lookahead, more);
        s.lookahead += n;
        if (s.lookahead + s.insert >= 3) {
            str = s.strstart - s.insert;
            s.ins_h = s.window[str];
            s.ins_h = (s.ins_h << s.hash_shift ^ s.window[str + 1]) & s.hash_mask;
            while(s.insert){
                s.ins_h = (s.ins_h << s.hash_shift ^ s.window[str + MIN_MATCH - 1]) & s.hash_mask;
                s.prev[str & s.w_mask] = s.head[s.ins_h];
                s.head[s.ins_h] = str;
                str++;
                s.insert--;
                if (s.lookahead + s.insert < 3) {
                    break;
                }
            }
        }
    }while (s.lookahead < MIN_LOOKAHEAD && s.strm.avail_in !== 0)
}
function deflate_stored(s, flush) {
    let max_block_size = 65535;
    if (max_block_size > s.pending_buf_size - 5) {
        max_block_size = s.pending_buf_size - 5;
    }
    for(;;){
        if (s.lookahead <= 1) {
            fill_window(s);
            if (s.lookahead === 0 && flush === STATUS.Z_NO_FLUSH) {
                return 1;
            }
            if (s.lookahead === 0) {
                break;
            }
        }
        s.strstart += s.lookahead;
        s.lookahead = 0;
        let max_start = s.block_start + max_block_size;
        if (s.strstart === 0 || s.strstart >= max_start) {
            s.lookahead = s.strstart - max_start;
            s.strstart = max_start;
            flush_block_only(s, false);
            if (s.strm.avail_out === 0) {
                return 1;
            }
        }
        if (s.strstart - s.block_start >= s.w_size - MIN_LOOKAHEAD) {
            flush_block_only(s, false);
            if (s.strm.avail_out === 0) {
                return 1;
            }
        }
    }
    s.insert = 0;
    if (flush === STATUS.Z_FINISH) {
        flush_block_only(s, true);
        if (s.strm.avail_out === 0) {
            return 3;
        }
        return 4;
    }
    if (s.strstart > s.block_start) {
        flush_block_only(s, false);
        if (s.strm.avail_out === 0) {
            return 1;
        }
    }
    return 1;
}
function deflate_fast(s, flush) {
    let hash_head;
    let bflush;
    for(;;){
        if (s.lookahead < MIN_LOOKAHEAD) {
            fill_window(s);
            if (s.lookahead < MIN_LOOKAHEAD && flush === STATUS.Z_NO_FLUSH) {
                return 1;
            }
            if (s.lookahead === 0) {
                break;
            }
        }
        hash_head = 0;
        if (s.lookahead >= 3) {
            s.ins_h = (s.ins_h << s.hash_shift ^ s.window[s.strstart + MIN_MATCH - 1]) & s.hash_mask;
            hash_head = s.prev[s.strstart & s.w_mask] = s.head[s.ins_h];
            s.head[s.ins_h] = s.strstart;
        }
        if (hash_head !== 0 && s.strstart - hash_head <= s.w_size - MIN_LOOKAHEAD) {
            s.match_length = longest_match(s, hash_head);
        }
        if (s.match_length >= 3) {
            bflush = _tr_tally(s, s.strstart - s.match_start, s.match_length - MIN_MATCH);
            s.lookahead -= s.match_length;
            if (s.match_length <= s.max_lazy_match && s.lookahead >= 3) {
                s.match_length--;
                do {
                    s.strstart++;
                    s.ins_h = (s.ins_h << s.hash_shift ^ s.window[s.strstart + MIN_MATCH - 1]) & s.hash_mask;
                    hash_head = s.prev[s.strstart & s.w_mask] = s.head[s.ins_h];
                    s.head[s.ins_h] = s.strstart;
                }while (--s.match_length !== 0)
                s.strstart++;
            } else {
                s.strstart += s.match_length;
                s.match_length = 0;
                s.ins_h = s.window[s.strstart];
                s.ins_h = (s.ins_h << s.hash_shift ^ s.window[s.strstart + 1]) & s.hash_mask;
            }
        } else {
            bflush = _tr_tally(s, 0, s.window[s.strstart]);
            s.lookahead--;
            s.strstart++;
        }
        if (bflush) {
            flush_block_only(s, false);
            if (s.strm.avail_out === 0) {
                return 1;
            }
        }
    }
    s.insert = s.strstart < MIN_MATCH - 1 ? s.strstart : MIN_MATCH - 1;
    if (flush === STATUS.Z_FINISH) {
        flush_block_only(s, true);
        if (s.strm.avail_out === 0) {
            return 3;
        }
        return 4;
    }
    if (s.last_lit) {
        flush_block_only(s, false);
        if (s.strm.avail_out === 0) {
            return 1;
        }
    }
    return 2;
}
function deflate_slow(s, flush) {
    let hash_head;
    let bflush;
    let max_insert;
    for(;;){
        if (s.lookahead < MIN_LOOKAHEAD) {
            fill_window(s);
            if (s.lookahead < MIN_LOOKAHEAD && flush === STATUS.Z_NO_FLUSH) {
                return 1;
            }
            if (s.lookahead === 0) break;
        }
        hash_head = 0;
        if (s.lookahead >= 3) {
            s.ins_h = (s.ins_h << s.hash_shift ^ s.window[s.strstart + MIN_MATCH - 1]) & s.hash_mask;
            hash_head = s.prev[s.strstart & s.w_mask] = s.head[s.ins_h];
            s.head[s.ins_h] = s.strstart;
        }
        s.prev_length = s.match_length;
        s.prev_match = s.match_start;
        s.match_length = MIN_MATCH - 1;
        if (hash_head !== 0 && s.prev_length < s.max_lazy_match && s.strstart - hash_head <= s.w_size - MIN_LOOKAHEAD) {
            s.match_length = longest_match(s, hash_head);
            if (s.match_length <= 5 && (s.strategy === 1 || s.match_length === 3 && s.strstart - s.match_start > 4096)) {
                s.match_length = MIN_MATCH - 1;
            }
        }
        if (s.prev_length >= 3 && s.match_length <= s.prev_length) {
            max_insert = s.strstart + s.lookahead - MIN_MATCH;
            bflush = _tr_tally(s, s.strstart - 1 - s.prev_match, s.prev_length - MIN_MATCH);
            s.lookahead -= s.prev_length - 1;
            s.prev_length -= 2;
            do {
                if (++s.strstart <= max_insert) {
                    s.ins_h = (s.ins_h << s.hash_shift ^ s.window[s.strstart + MIN_MATCH - 1]) & s.hash_mask;
                    hash_head = s.prev[s.strstart & s.w_mask] = s.head[s.ins_h];
                    s.head[s.ins_h] = s.strstart;
                }
            }while (--s.prev_length !== 0)
            s.match_available = 0;
            s.match_length = MIN_MATCH - 1;
            s.strstart++;
            if (bflush) {
                flush_block_only(s, false);
                if (s.strm.avail_out === 0) {
                    return 1;
                }
            }
        } else if (s.match_available) {
            bflush = _tr_tally(s, 0, s.window[s.strstart - 1]);
            if (bflush) {
                flush_block_only(s, false);
            }
            s.strstart++;
            s.lookahead--;
            if (s.strm.avail_out === 0) {
                return 1;
            }
        } else {
            s.match_available = 1;
            s.strstart++;
            s.lookahead--;
        }
    }
    if (s.match_available) {
        bflush = _tr_tally(s, 0, s.window[s.strstart - 1]);
        s.match_available = 0;
    }
    s.insert = s.strstart < MIN_MATCH - 1 ? s.strstart : MIN_MATCH - 1;
    if (flush === STATUS.Z_FINISH) {
        flush_block_only(s, true);
        if (s.strm.avail_out === 0) {
            return 3;
        }
        return 4;
    }
    if (s.last_lit) {
        flush_block_only(s, false);
        if (s.strm.avail_out === 0) {
            return 1;
        }
    }
    return 2;
}
function deflate_rle(s, flush) {
    let bflush;
    let prev;
    let scan, strend;
    let _win = s.window;
    for(;;){
        if (s.lookahead <= 258) {
            fill_window(s);
            if (s.lookahead <= 258 && flush === STATUS.Z_NO_FLUSH) {
                return 1;
            }
            if (s.lookahead === 0) break;
        }
        s.match_length = 0;
        if (s.lookahead >= 3 && s.strstart > 0) {
            scan = s.strstart - 1;
            prev = _win[scan];
            if (prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan]) {
                strend = s.strstart + MAX_MATCH;
                do {
                }while (prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && scan < strend)
                s.match_length = MAX_MATCH - (strend - scan);
                if (s.match_length > s.lookahead) {
                    s.match_length = s.lookahead;
                }
            }
        }
        if (s.match_length >= 3) {
            bflush = _tr_tally(s, 1, s.match_length - MIN_MATCH);
            s.lookahead -= s.match_length;
            s.strstart += s.match_length;
            s.match_length = 0;
        } else {
            bflush = _tr_tally(s, 0, s.window[s.strstart]);
            s.lookahead--;
            s.strstart++;
        }
        if (bflush) {
            flush_block_only(s, false);
            if (s.strm.avail_out === 0) {
                return 1;
            }
        }
    }
    s.insert = 0;
    if (flush === STATUS.Z_FINISH) {
        flush_block_only(s, true);
        if (s.strm.avail_out === 0) {
            return 3;
        }
        return 4;
    }
    if (s.last_lit) {
        flush_block_only(s, false);
        if (s.strm.avail_out === 0) {
            return 1;
        }
    }
    return 2;
}
function deflate_huff(s, flush) {
    let bflush;
    for(;;){
        if (s.lookahead === 0) {
            fill_window(s);
            if (s.lookahead === 0) {
                if (flush === STATUS.Z_NO_FLUSH) {
                    return 1;
                }
                break;
            }
        }
        s.match_length = 0;
        bflush = _tr_tally(s, 0, s.window[s.strstart]);
        s.lookahead--;
        s.strstart++;
        if (bflush) {
            flush_block_only(s, false);
            if (s.strm.avail_out === 0) {
                return 1;
            }
        }
    }
    s.insert = 0;
    if (flush === STATUS.Z_FINISH) {
        flush_block_only(s, true);
        if (s.strm.avail_out === 0) {
            return 3;
        }
        return 4;
    }
    if (s.last_lit) {
        flush_block_only(s, false);
        if (s.strm.avail_out === 0) {
            return 1;
        }
    }
    return 2;
}
class Config {
    good_length;
    max_lazy;
    nice_length;
    max_chain;
    func;
    constructor(good_length1, max_lazy1, nice_length1, max_chain1, func1){
        this.good_length = good_length1;
        this.max_lazy = max_lazy1;
        this.nice_length = nice_length1;
        this.max_chain = max_chain1;
        this.func = func1;
    }
}
let configuration_table;
configuration_table = [
    new Config(0, 0, 0, 0, deflate_stored),
    new Config(4, 4, 8, 4, deflate_fast),
    new Config(4, 5, 16, 8, deflate_fast),
    new Config(4, 6, 32, 32, deflate_fast),
    new Config(4, 4, 16, 16, deflate_slow),
    new Config(8, 16, 32, 32, deflate_slow),
    new Config(8, 16, 128, 128, deflate_slow),
    new Config(8, 32, 128, 256, deflate_slow),
    new Config(32, 128, 258, 1024, deflate_slow),
    new Config(32, 258, 258, 4096, deflate_slow)
];
function lm_init(s) {
    s.window_size = 2 * s.w_size;
    zero1(s.head);
    s.max_lazy_match = configuration_table[s.level].max_lazy;
    s.good_match = configuration_table[s.level].good_length;
    s.nice_match = configuration_table[s.level].nice_length;
    s.max_chain_length = configuration_table[s.level].max_chain;
    s.strstart = 0;
    s.block_start = 0;
    s.lookahead = 0;
    s.insert = 0;
    s.match_length = s.prev_length = MIN_MATCH - 1;
    s.match_available = 0;
    s.ins_h = 0;
}
class DeflateState {
    strm = null;
    status = 0;
    pending_buf = null;
    pending_buf_size = 0;
    pending_out = 0;
    pending = 0;
    wrap = 0;
    gzhead = null;
    gzindex = 0;
    method = 8;
    last_flush = -1;
    w_size = 0;
    w_bits = 0;
    w_mask = 0;
    window = null;
    window_size = 0;
    prev = null;
    head = null;
    ins_h = 0;
    hash_size = 0;
    hash_bits = 0;
    hash_mask = 0;
    hash_shift = 0;
    block_start = 0;
    match_length = 0;
    prev_match = 0;
    match_available = 0;
    strstart = 0;
    match_start = 0;
    lookahead = 0;
    prev_length = 0;
    max_chain_length = 0;
    max_lazy_match = 0;
    level = 0;
    strategy = 0;
    good_match = 0;
    nice_match = 0;
    dyn_ltree = new Uint16Array(HEAP_SIZE1 * 2);
    dyn_dtree = new Uint16Array((2 * 30 + 1) * 2);
    bl_tree = new Uint16Array((2 * 19 + 1) * 2);
    l_desc = null;
    d_desc = null;
    bl_desc = null;
    bl_count = new Uint16Array(15 + 1);
    heap = new Uint16Array(2 * L_CODES1 + 1);
    heap_len = 0;
    heap_max = 0;
    depth = new Uint16Array(2 * L_CODES1 + 1);
    l_buf = 0;
    lit_bufsize = 0;
    last_lit = 0;
    d_buf = 0;
    opt_len = 0;
    static_len = 0;
    matches = 0;
    insert = 0;
    bi_buf = 0;
    bi_valid = 0;
    constructor(){
        zero1(this.dyn_ltree);
        zero1(this.dyn_dtree);
        zero1(this.bl_tree);
        zero1(this.heap);
        zero1(this.depth);
    }
}
function deflateResetKeep(strm) {
    let s;
    if (!strm || !strm.state) {
        return err1(strm, STATUS.Z_STREAM_ERROR.toString());
    }
    strm.total_in = strm.total_out = 0;
    strm.data_type = Z_UNKNOWN;
    s = strm.state;
    s.pending = 0;
    s.pending_out = 0;
    if (s.wrap < 0) {
        s.wrap = -s.wrap;
    }
    s.status = s.wrap ? INIT_STATE : BUSY_STATE;
    strm.adler = s.wrap === 2 ? 0 : 1;
    s.last_flush = STATUS.Z_NO_FLUSH;
    _tr_init(s);
    return 0;
}
function deflateReset(strm) {
    let ret = deflateResetKeep(strm);
    if (ret === 0) {
        lm_init(strm.state);
    }
    return ret;
}
function deflateSetHeader(strm, head) {
    if (!strm || !strm.state) return Z_STREAM_ERROR;
    if (strm.state.wrap !== 2) return Z_STREAM_ERROR;
    strm.state.gzhead = head;
    return 0;
}
function deflateInit2(strm, level, method, windowBits, memLevel, strategy) {
    if (!strm) {
        return STATUS.Z_STREAM_ERROR;
    }
    let wrap = 1;
    if (level === Z_DEFAULT_COMPRESSION) {
        level = 6;
    }
    if (windowBits < 0) {
        wrap = 0;
        windowBits = -windowBits;
    } else if (windowBits > 15) {
        wrap = 2;
        windowBits -= 16;
    }
    if (memLevel < 1 || memLevel > 9 || method !== 8 || windowBits < 8 || windowBits > 15 || level < 0 || level > 9 || strategy < 0 || strategy > 4) {
        return err1(strm, STATUS.Z_STREAM_ERROR.toString());
    }
    if (windowBits === 8) {
        windowBits = 9;
    }
    let s = new DeflateState();
    strm.state = s;
    s.strm = strm;
    s.wrap = wrap;
    s.gzhead = null;
    s.w_bits = windowBits;
    s.w_size = 1 << s.w_bits;
    s.w_mask = s.w_size - 1;
    s.hash_bits = memLevel + 7;
    s.hash_size = 1 << s.hash_bits;
    s.hash_mask = s.hash_size - 1;
    s.hash_shift = ~~((s.hash_bits + MIN_MATCH - 1) / MIN_MATCH);
    s.window = new Uint8Array(s.w_size * 2);
    s.head = new Uint16Array(s.hash_size);
    s.prev = new Uint16Array(s.w_size);
    s.lit_bufsize = 1 << memLevel + 6;
    s.pending_buf_size = s.lit_bufsize * 4;
    s.pending_buf = new Uint8Array(s.pending_buf_size);
    s.d_buf = 1 * s.lit_bufsize;
    s.l_buf = (1 + 2) * s.lit_bufsize;
    s.level = level;
    s.strategy = strategy;
    s.method = method;
    return deflateReset(strm);
}
function deflate1(strm, flush) {
    let old_flush, s;
    let beg, val;
    if (!strm || !strm.state || flush > STATUS.Z_BLOCK || flush < 0) {
        return strm ? err1(strm, STATUS.Z_STREAM_ERROR) : Z_STREAM_ERROR;
    }
    s = strm.state;
    if (!strm.output || !strm.input && strm.avail_in !== 0 || s.status === 666 && flush !== STATUS.Z_FINISH) {
        return err1(strm, strm.avail_out === 0 ? STATUS.Z_BUF_ERROR : STATUS.Z_STREAM_ERROR);
    }
    s.strm = strm;
    old_flush = s.last_flush;
    s.last_flush = flush;
    if (s.status === 42) {
        if (s.wrap === 2) {
            strm.adler = 0;
            put_byte(s, 31);
            put_byte(s, 139);
            put_byte(s, 8);
            if (!s.gzhead) {
                put_byte(s, 0);
                put_byte(s, 0);
                put_byte(s, 0);
                put_byte(s, 0);
                put_byte(s, 0);
                put_byte(s, s.level === 9 ? 2 : s.strategy >= 2 || s.level < 2 ? 4 : 0);
                put_byte(s, 3);
                s.status = BUSY_STATE;
            } else {
                put_byte(s, (s.gzhead.text ? 1 : 0) + (s.gzhead.hcrc ? 2 : 0) + (!s.gzhead.extra ? 0 : 4) + (!s.gzhead.name ? 0 : 8) + (!s.gzhead.comment ? 0 : 16));
                put_byte(s, s.gzhead.time & 255);
                put_byte(s, s.gzhead.time >> 8 & 255);
                put_byte(s, s.gzhead.time >> 16 & 255);
                put_byte(s, s.gzhead.time >> 24 & 255);
                put_byte(s, s.level === 9 ? 2 : s.strategy >= 2 || s.level < 2 ? 4 : 0);
                put_byte(s, s.gzhead.os & 255);
                if (s.gzhead.extra && s.gzhead.extra.length) {
                    put_byte(s, s.gzhead.extra.length & 255);
                    put_byte(s, s.gzhead.extra.length >> 8 & 255);
                }
                if (s.gzhead.hcrc) {
                    strm.adler = crc32(strm.adler, s.pending_buf, s.pending, 0);
                }
                s.gzindex = 0;
                s.status = EXTRA_STATE;
            }
        } else {
            let header = 8 + (s.w_bits - 8 << 4) << 8;
            let level_flags = -1;
            if (s.strategy >= 2 || s.level < 2) {
                level_flags = 0;
            } else if (s.level < 6) {
                level_flags = 1;
            } else if (s.level === 6) {
                level_flags = 2;
            } else {
                level_flags = 3;
            }
            header |= level_flags << 6;
            if (s.strstart !== 0) header |= PRESET_DICT;
            header += 31 - header % 31;
            s.status = BUSY_STATE;
            putShortMSB(s, header);
            if (s.strstart !== 0) {
                putShortMSB(s, strm.adler >>> 16);
                putShortMSB(s, strm.adler & 65535);
            }
            strm.adler = 1;
        }
    }
    if (s.status === 69) {
        if (s.gzhead.extra) {
            beg = s.pending;
            while(s.gzindex < (s.gzhead.extra.length & 65535)){
                if (s.pending === s.pending_buf_size) {
                    if (s.gzhead.hcrc && s.pending > beg) {
                        strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg);
                    }
                    flush_pending(strm);
                    beg = s.pending;
                    if (s.pending === s.pending_buf_size) {
                        break;
                    }
                }
                put_byte(s, s.gzhead.extra[s.gzindex] & 255);
                s.gzindex++;
            }
            if (s.gzhead.hcrc && s.pending > beg) {
                strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg);
            }
            if (s.gzindex === s.gzhead.extra.length) {
                s.gzindex = 0;
                s.status = NAME_STATE;
            }
        } else {
            s.status = NAME_STATE;
        }
    }
    if (s.status === 73) {
        if (s.gzhead.name) {
            beg = s.pending;
            do {
                if (s.pending === s.pending_buf_size) {
                    if (s.gzhead.hcrc && s.pending > beg) {
                        strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg);
                    }
                    flush_pending(strm);
                    beg = s.pending;
                    if (s.pending === s.pending_buf_size) {
                        val = 1;
                        break;
                    }
                }
                if (s.gzindex < s.gzhead.name.length) {
                    val = s.gzhead.name.charCodeAt(s.gzindex++) & 255;
                } else {
                    val = 0;
                }
                put_byte(s, val);
            }while (val !== 0)
            if (s.gzhead.hcrc && s.pending > beg) {
                strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg);
            }
            if (val === 0) {
                s.gzindex = 0;
                s.status = COMMENT_STATE;
            }
        } else {
            s.status = COMMENT_STATE;
        }
    }
    if (s.status === 91) {
        if (s.gzhead.comment) {
            beg = s.pending;
            do {
                if (s.pending === s.pending_buf_size) {
                    if (s.gzhead.hcrc && s.pending > beg) {
                        strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg);
                    }
                    flush_pending(strm);
                    beg = s.pending;
                    if (s.pending === s.pending_buf_size) {
                        val = 1;
                        break;
                    }
                }
                if (s.gzindex < s.gzhead.comment.length) {
                    val = s.gzhead.comment.charCodeAt(s.gzindex++) & 255;
                } else {
                    val = 0;
                }
                put_byte(s, val);
            }while (val !== 0)
            if (s.gzhead.hcrc && s.pending > beg) {
                strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg);
            }
            if (val === 0) {
                s.status = HCRC_STATE;
            }
        } else {
            s.status = HCRC_STATE;
        }
    }
    if (s.status === 103) {
        if (s.gzhead.hcrc) {
            if (s.pending + 2 > s.pending_buf_size) {
                flush_pending(strm);
            }
            if (s.pending + 2 <= s.pending_buf_size) {
                put_byte(s, strm.adler & 255);
                put_byte(s, strm.adler >> 8 & 255);
                strm.adler = 0;
                s.status = BUSY_STATE;
            }
        } else {
            s.status = BUSY_STATE;
        }
    }
    if (s.pending !== 0) {
        flush_pending(strm);
        if (strm.avail_out === 0) {
            s.last_flush = -1;
            return 0;
        }
    } else if (strm.avail_in === 0 && rank(flush) <= rank(old_flush) && flush !== STATUS.Z_FINISH) {
        return err1(strm, STATUS.Z_BUF_ERROR);
    }
    if (s.status === 666 && strm.avail_in !== 0) {
        return err1(strm, STATUS.Z_BUF_ERROR);
    }
    if (strm.avail_in !== 0 || s.lookahead !== 0 || flush !== STATUS.Z_NO_FLUSH && s.status !== 666) {
        let bstate = s.strategy === 2 ? deflate_huff(s, flush) : s.strategy === 3 ? deflate_rle(s, flush) : configuration_table[s.level].func(s, flush);
        if (bstate === 3 || bstate === 4) {
            s.status = FINISH_STATE;
        }
        if (bstate === 1 || bstate === 3) {
            if (strm.avail_out === 0) {
                s.last_flush = -1;
            }
            return STATUS.Z_OK;
        }
        if (bstate === 2) {
            if (flush === STATUS.Z_PARTIAL_FLUSH) {
                _tr_align(s);
            } else if (flush !== STATUS.Z_BLOCK) {
                _tr_stored_block(s, 0, 0, false);
                if (flush === STATUS.Z_FULL_FLUSH) {
                    zero1(s.head);
                    if (s.lookahead === 0) {
                        s.strstart = 0;
                        s.block_start = 0;
                        s.insert = 0;
                    }
                }
            }
            flush_pending(strm);
            if (strm.avail_out === 0) {
                s.last_flush = -1;
                return STATUS.Z_OK;
            }
        }
    }
    if (flush !== STATUS.Z_FINISH) return STATUS.Z_OK;
    if (s.wrap <= 0) return STATUS.Z_STREAM_END;
    if (s.wrap === 2) {
        put_byte(s, strm.adler & 255);
        put_byte(s, strm.adler >> 8 & 255);
        put_byte(s, strm.adler >> 16 & 255);
        put_byte(s, strm.adler >> 24 & 255);
        put_byte(s, strm.total_in & 255);
        put_byte(s, strm.total_in >> 8 & 255);
        put_byte(s, strm.total_in >> 16 & 255);
        put_byte(s, strm.total_in >> 24 & 255);
    } else {
        putShortMSB(s, strm.adler >>> 16);
        putShortMSB(s, strm.adler & 65535);
    }
    flush_pending(strm);
    if (s.wrap > 0) s.wrap = -s.wrap;
    return s.pending !== 0 ? 0 : 1;
}
function deflateEnd(strm) {
    let status;
    if (!strm || !strm.state) {
        return Z_STREAM_ERROR;
    }
    status = strm.state.status;
    if (status !== 42 && status !== 69 && status !== 73 && status !== 91 && status !== 103 && status !== 113 && status !== 666) {
        return err1(strm, STATUS.Z_STREAM_ERROR);
    }
    strm.state = null;
    return status === 113 ? err1(strm, STATUS.Z_DATA_ERROR) : 0;
}
function deflateSetDictionary(strm, dictionary) {
    let dictLength = dictionary.length;
    let s;
    let str, n;
    let wrap;
    let avail;
    let next;
    let input;
    let tmpDict;
    if (!strm || !strm.state) {
        return Z_STREAM_ERROR;
    }
    s = strm.state;
    wrap = s.wrap;
    if (wrap === 2 || wrap === 1 && s.status !== 42 || s.lookahead) {
        return Z_STREAM_ERROR;
    }
    if (wrap === 1) {
        strm.adler = adler32(strm.adler, dictionary, dictLength, 0);
    }
    s.wrap = 0;
    if (dictLength >= s.w_size) {
        if (wrap === 0) {
            zero1(s.head);
            s.strstart = 0;
            s.block_start = 0;
            s.insert = 0;
        }
        tmpDict = new Uint8Array(s.w_size);
        tmpDict.set(dictionary.subarray(dictLength - s.w_size, dictLength), 0);
        dictionary = tmpDict;
        dictLength = s.w_size;
    }
    avail = strm.avail_in;
    next = strm.next_in;
    input = strm.input;
    strm.avail_in = dictLength;
    strm.next_in = 0;
    strm.input = dictionary;
    fill_window(s);
    while(s.lookahead >= 3){
        str = s.strstart;
        n = s.lookahead - (MIN_MATCH - 1);
        do {
            s.ins_h = (s.ins_h << s.hash_shift ^ s.window[str + MIN_MATCH - 1]) & s.hash_mask;
            s.prev[str & s.w_mask] = s.head[s.ins_h];
            s.head[s.ins_h] = str;
            str++;
        }while (--n)
        s.strstart = str;
        s.lookahead = MIN_MATCH - 1;
        fill_window(s);
    }
    s.strstart += s.lookahead;
    s.block_start = s.strstart;
    s.insert = s.lookahead;
    s.lookahead = 0;
    s.match_length = s.prev_length = MIN_MATCH - 1;
    s.match_available = 0;
    strm.next_in = next;
    strm.input = input;
    strm.avail_in = avail;
    s.wrap = wrap;
    return 0;
}
function concatUint8Array(arr) {
    const length = arr.reduce((pre, next)=>pre + next.length
    , 0);
    const result = new Uint8Array(length);
    let offset = 0;
    for (const v of arr){
        result.set(v, offset);
        offset += v.length;
    }
    return result;
}
class ZStream {
    input = null;
    next_in = 0;
    avail_in = 0;
    total_in = 0;
    output = null;
    next_out = 0;
    avail_out = 0;
    total_out = 0;
    msg = "";
    state = null;
    data_type = 2;
    adler = 0;
}
class Deflate {
    err = 0;
    msg = "";
    ended = false;
    strm;
    _dict_set = false;
    options;
    constructor(options1 = {
    }){
        this.options = Object.assign({
            level: STATUS.Z_DEFAULT_COMPRESSION,
            method: STATUS.Z_DEFLATED,
            chunkSize: 16384,
            windowBits: 15,
            memLevel: 8,
            strategy: STATUS.Z_DEFAULT_STRATEGY,
            to: ""
        }, options1);
        const opt = this.options;
        if (opt.raw && opt.windowBits > 0) {
            opt.windowBits = -opt.windowBits;
        } else if (opt.gzip && opt.windowBits > 0 && opt.windowBits < 16) {
            opt.windowBits += 16;
        }
        this.strm = new ZStream();
        this.strm.avail_out = 0;
        let status1 = deflateInit2(this.strm, opt.level, opt.method, opt.windowBits, opt.memLevel, opt.strategy);
        if (status1 !== STATUS.Z_OK) {
            throw new Error(message9[status1]);
        }
        if (opt.header) {
            deflateSetHeader(this.strm, opt.header);
        }
        if (opt.dictionary) {
            status1 = deflateSetDictionary(this.strm, opt.dictionary);
            if (status1 !== STATUS.Z_OK) {
                throw new Error(message9[status1]);
            }
            this._dict_set = true;
        }
    }
    push(data, mode) {
        const strm = this.strm;
        const chunkSize = this.options.chunkSize;
        const chunks = [];
        let status;
        if (this.ended) {
            throw new Error("can not call after ended");
        }
        const _mode = mode === ~~mode ? mode : mode === true ? STATUS.Z_FINISH : STATUS.Z_NO_FLUSH;
        strm.input = data;
        strm.next_in = 0;
        strm.avail_in = strm.input.length;
        do {
            if (strm.avail_out === 0) {
                strm.output = new Uint8Array(chunkSize);
                strm.next_out = 0;
                strm.avail_out = chunkSize;
            }
            status = deflate1(strm, _mode);
            if (status !== STATUS.Z_STREAM_END && status !== STATUS.Z_OK) {
                this.ended = true;
                throw new Error(this.strm.msg);
            }
            if (strm.avail_out === 0 || strm.avail_in === 0 && (_mode === STATUS.Z_FINISH || _mode === STATUS.Z_SYNC_FLUSH)) {
                chunks.push(strm.output.subarray(0, strm.next_out));
            }
        }while ((strm.avail_in > 0 || strm.avail_out === 0) && status !== STATUS.Z_STREAM_END)
        if (_mode === STATUS.Z_FINISH) {
            status = deflateEnd(this.strm);
            this.ended = true;
            if (status !== STATUS.Z_OK) throw new Error(this.strm.msg);
        }
        if (_mode === STATUS.Z_SYNC_FLUSH) {
            strm.avail_out = 0;
        }
        return concatUint8Array(chunks);
    }
}
const BAD = 30;
const TYPE = 12;
function inflate_fast(strm, start) {
    let state;
    let _in;
    let last;
    let _out;
    let beg;
    let end;
    let dmax;
    let wsize;
    let whave;
    let wnext;
    let s_window;
    let hold;
    let bits;
    let lcode;
    let dcode;
    let lmask;
    let dmask;
    let here;
    let op;
    let len;
    let dist;
    let from;
    let from_source;
    let input, output;
    state = strm.state;
    _in = strm.next_in;
    input = strm.input;
    last = _in + (strm.avail_in - 5);
    _out = strm.next_out;
    output = strm.output;
    beg = _out - (start - strm.avail_out);
    end = _out + (strm.avail_out - 257);
    dmax = state.dmax;
    wsize = state.wsize;
    whave = state.whave;
    wnext = state.wnext;
    s_window = state.window;
    hold = state.hold;
    bits = state.bits;
    lcode = state.lencode;
    dcode = state.distcode;
    lmask = (1 << state.lenbits) - 1;
    dmask = (1 << state.distbits) - 1;
    top: do {
        if (bits < 15) {
            hold += input[_in++] << bits;
            bits += 8;
            hold += input[_in++] << bits;
            bits += 8;
        }
        here = lcode[hold & lmask];
        dolen: for(;;){
            op = here >>> 24;
            hold >>>= op;
            bits -= op;
            op = here >>> 16 & 255;
            if (op === 0) {
                output[_out++] = here & 65535;
            } else if (op & 16) {
                len = here & 65535;
                op &= 15;
                if (op) {
                    if (bits < op) {
                        hold += input[_in++] << bits;
                        bits += 8;
                    }
                    len += hold & (1 << op) - 1;
                    hold >>>= op;
                    bits -= op;
                }
                if (bits < 15) {
                    hold += input[_in++] << bits;
                    bits += 8;
                    hold += input[_in++] << bits;
                    bits += 8;
                }
                here = dcode[hold & dmask];
                dodist: for(;;){
                    op = here >>> 24;
                    hold >>>= op;
                    bits -= op;
                    op = here >>> 16 & 255;
                    if (op & 16) {
                        dist = here & 65535;
                        op &= 15;
                        if (bits < op) {
                            hold += input[_in++] << bits;
                            bits += 8;
                            if (bits < op) {
                                hold += input[_in++] << bits;
                                bits += 8;
                            }
                        }
                        dist += hold & (1 << op) - 1;
                        if (dist > dmax) {
                            strm.msg = "invalid distance too far back";
                            state.mode = BAD;
                            break top;
                        }
                        hold >>>= op;
                        bits -= op;
                        op = _out - beg;
                        if (dist > op) {
                            op = dist - op;
                            if (op > whave) {
                                if (state.sane) {
                                    strm.msg = "invalid distance too far back";
                                    state.mode = BAD;
                                    break top;
                                }
                            }
                            from = 0;
                            from_source = s_window;
                            if (wnext === 0) {
                                from += wsize - op;
                                if (op < len) {
                                    len -= op;
                                    do {
                                        output[_out++] = s_window[from++];
                                    }while (--op)
                                    from = _out - dist;
                                    from_source = output;
                                }
                            } else if (wnext < op) {
                                from += wsize + wnext - op;
                                op -= wnext;
                                if (op < len) {
                                    len -= op;
                                    do {
                                        output[_out++] = s_window[from++];
                                    }while (--op)
                                    from = 0;
                                    if (wnext < len) {
                                        op = wnext;
                                        len -= op;
                                        do {
                                            output[_out++] = s_window[from++];
                                        }while (--op)
                                        from = _out - dist;
                                        from_source = output;
                                    }
                                }
                            } else {
                                from += wnext - op;
                                if (op < len) {
                                    len -= op;
                                    do {
                                        output[_out++] = s_window[from++];
                                    }while (--op)
                                    from = _out - dist;
                                    from_source = output;
                                }
                            }
                            while(len > 2){
                                output[_out++] = from_source[from++];
                                output[_out++] = from_source[from++];
                                output[_out++] = from_source[from++];
                                len -= 3;
                            }
                            if (len) {
                                output[_out++] = from_source[from++];
                                if (len > 1) {
                                    output[_out++] = from_source[from++];
                                }
                            }
                        } else {
                            from = _out - dist;
                            do {
                                output[_out++] = output[from++];
                                output[_out++] = output[from++];
                                output[_out++] = output[from++];
                                len -= 3;
                            }while (len > 2)
                            if (len) {
                                output[_out++] = output[from++];
                                if (len > 1) {
                                    output[_out++] = output[from++];
                                }
                            }
                        }
                    } else if ((op & 64) === 0) {
                        here = dcode[(here & 65535) + (hold & (1 << op) - 1)];
                        continue dodist;
                    } else {
                        strm.msg = "invalid distance code";
                        state.mode = BAD;
                        break top;
                    }
                    break;
                }
            } else if ((op & 64) === 0) {
                here = lcode[(here & 65535) + (hold & (1 << op) - 1)];
                continue dolen;
            } else if (op & 32) {
                state.mode = TYPE;
                break top;
            } else {
                strm.msg = "invalid literal/length code";
                state.mode = BAD;
                break top;
            }
            break;
        }
    }while (_in < last && _out < end)
    len = bits >> 3;
    _in -= len;
    bits -= len << 3;
    hold &= (1 << bits) - 1;
    strm.next_in = _in;
    strm.next_out = _out;
    strm.avail_in = _in < last ? 5 + (last - _in) : 5 - (_in - last);
    strm.avail_out = _out < end ? 257 + (end - _out) : 257 - (_out - end);
    state.hold = hold;
    state.bits = bits;
    return;
}
const MAXBITS = 15;
const lbase = [
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
    11,
    13,
    15,
    17,
    19,
    23,
    27,
    31,
    35,
    43,
    51,
    59,
    67,
    83,
    99,
    115,
    131,
    163,
    195,
    227,
    258,
    0,
    0, 
];
const lext = [
    16,
    16,
    16,
    16,
    16,
    16,
    16,
    16,
    17,
    17,
    17,
    17,
    18,
    18,
    18,
    18,
    19,
    19,
    19,
    19,
    20,
    20,
    20,
    20,
    21,
    21,
    21,
    21,
    16,
    72,
    78, 
];
const dbase = [
    1,
    2,
    3,
    4,
    5,
    7,
    9,
    13,
    17,
    25,
    33,
    49,
    65,
    97,
    129,
    193,
    257,
    385,
    513,
    769,
    1025,
    1537,
    2049,
    3073,
    4097,
    6145,
    8193,
    12289,
    16385,
    24577,
    0,
    0, 
];
const dext = [
    16,
    16,
    16,
    16,
    17,
    17,
    18,
    18,
    19,
    19,
    20,
    20,
    21,
    21,
    22,
    22,
    23,
    23,
    24,
    24,
    25,
    25,
    26,
    26,
    27,
    27,
    28,
    28,
    29,
    29,
    64,
    64, 
];
function inflate_table(type, lens, lens_index, codes, table, table_index, work, opts) {
    let bits = opts.bits;
    let len = 0;
    let sym = 0;
    let min = 0, max = 0;
    let root = 0;
    let curr = 0;
    let drop = 0;
    let left = 0;
    let used = 0;
    let huff = 0;
    let incr;
    let fill;
    let low;
    let mask;
    let next;
    let base = null;
    let base_index = 0;
    let end;
    let count = new Uint16Array(15 + 1);
    let offs = new Uint16Array(15 + 1);
    let extra = null;
    let extra_index = 0;
    let here_bits, here_op, here_val;
    for(len = 0; len <= 15; len++){
        count[len] = 0;
    }
    for(sym = 0; sym < codes; sym++){
        count[lens[lens_index + sym]]++;
    }
    root = bits;
    for(max = MAXBITS; max >= 1; max--){
        if (count[max] !== 0) break;
    }
    if (root > max) {
        root = max;
    }
    if (max === 0) {
        table[table_index++] = 1 << 24 | 64 << 16 | 0;
        table[table_index++] = 1 << 24 | 64 << 16 | 0;
        opts.bits = 1;
        return 0;
    }
    for(min = 1; min < max; min++){
        if (count[min] !== 0) break;
    }
    if (root < min) {
        root = min;
    }
    left = 1;
    for(len = 1; len <= 15; len++){
        left <<= 1;
        left -= count[len];
        if (left < 0) {
            return -1;
        }
    }
    if (left > 0 && (type === 0 || max !== 1)) {
        return -1;
    }
    offs[1] = 0;
    for(len = 1; len < 15; len++){
        offs[len + 1] = offs[len] + count[len];
    }
    for(sym = 0; sym < codes; sym++){
        if (lens[lens_index + sym] !== 0) {
            work[offs[lens[lens_index + sym]]++] = sym;
        }
    }
    if (type === 0) {
        base = extra = work;
        end = 19;
    } else if (type === 1) {
        base = lbase;
        base_index -= 257;
        extra = lext;
        extra_index -= 257;
        end = 256;
    } else {
        base = dbase;
        extra = dext;
        end = -1;
    }
    huff = 0;
    sym = 0;
    len = min;
    next = table_index;
    curr = root;
    drop = 0;
    low = -1;
    used = 1 << root;
    mask = used - 1;
    if (type === 1 && used > 852 || type === 2 && used > 592) {
        return 1;
    }
    for(;;){
        here_bits = len - drop;
        if (work[sym] < end) {
            here_op = 0;
            here_val = work[sym];
        } else if (work[sym] > end) {
            here_op = extra[extra_index + work[sym]];
            here_val = base[base_index + work[sym]];
        } else {
            here_op = 32 + 64;
            here_val = 0;
        }
        incr = 1 << len - drop;
        fill = 1 << curr;
        min = fill;
        do {
            fill -= incr;
            table[next + (huff >> drop) + fill] = here_bits << 24 | here_op << 16 | here_val | 0;
        }while (fill !== 0)
        incr = 1 << len - 1;
        while(huff & incr){
            incr >>= 1;
        }
        if (incr !== 0) {
            huff &= incr - 1;
            huff += incr;
        } else {
            huff = 0;
        }
        sym++;
        if (--count[len] === 0) {
            if (len === max) break;
            len = lens[lens_index + work[sym]];
        }
        if (len > root && (huff & mask) !== low) {
            if (drop === 0) {
                drop = root;
            }
            next += min;
            curr = len - drop;
            left = 1 << curr;
            while(curr + drop < max){
                left -= count[curr + drop];
                if (left <= 0) break;
                curr++;
                left <<= 1;
            }
            used += 1 << curr;
            if (type === 1 && used > 852 || type === 2 && used > 592) {
                return 1;
            }
            low = huff & mask;
            table[low] = root << 24 | curr << 16 | next - table_index | 0;
        }
    }
    if (huff !== 0) {
        table[next + huff] = len - drop << 24 | 64 << 16 | 0;
    }
    opts.bits = root;
    return 0;
}
const CODES = 0;
const LENS = 1;
const DISTS = 2;
const Z_OK = 0;
const Z_STREAM_END = 1;
const Z_STREAM_ERROR1 = -2;
const Z_DATA_ERROR = -3;
const Z_MEM_ERROR = -4;
const Z_BUF_ERROR = -5;
const HEAD = 1;
const FLAGS = 2;
const TIME = 3;
const OS = 4;
const EXLEN = 5;
const EXTRA = 6;
const NAME = 7;
const COMMENT = 8;
const HCRC = 9;
const DICTID = 10;
const DICT = 11;
const TYPE1 = 12;
const TYPEDO = 13;
const STORED = 14;
const COPY_ = 15;
const COPY = 16;
const TABLE = 17;
const LENLENS = 18;
const CODELENS = 19;
const LEN_ = 20;
const LEN = 21;
const LENEXT = 22;
const DIST = 23;
const DISTEXT = 24;
const MATCH = 25;
const LIT = 26;
const CHECK = 27;
const LENGTH = 28;
const DONE = 29;
const BAD1 = 30;
const MEM = 31;
const ENOUGH_LENS = 852;
const ENOUGH_DISTS = 592;
function zswap32(q) {
    return (q >>> 24 & 255) + (q >>> 8 & 65280) + ((q & 65280) << 8) + ((q & 255) << 24);
}
class InflateState {
    mode = 0;
    last = false;
    wrap = 0;
    havedict = false;
    flags = 0;
    dmax = 0;
    check = 0;
    total = 0;
    head = null;
    wbits = 0;
    wsize = 0;
    whave = 0;
    wnext = 0;
    window = null;
    hold = 0;
    bits = 0;
    length = 0;
    offset = 0;
    extra = 0;
    lencode = null;
    distcode = null;
    lenbits = 0;
    distbits = 0;
    ncode = 0;
    nlen = 0;
    ndist = 0;
    have = 0;
    next = null;
    lens = new Uint16Array(320);
    work = new Uint16Array(288);
    lendyn = null;
    distdyn = null;
    sane = 0;
    back = 0;
    was = 0;
}
function inflateResetKeep(strm) {
    let state;
    if (!strm || !strm.state) return Z_STREAM_ERROR1;
    state = strm.state;
    strm.total_in = strm.total_out = state.total = 0;
    strm.msg = "";
    if (state.wrap) {
        strm.adler = state.wrap & 1;
    }
    state.mode = HEAD;
    state.last = 0;
    state.havedict = 0;
    state.dmax = 32768;
    state.head = null;
    state.hold = 0;
    state.bits = 0;
    state.lencode = state.lendyn = new Uint32Array(ENOUGH_LENS);
    state.distcode = state.distdyn = new Uint32Array(ENOUGH_DISTS);
    state.sane = 1;
    state.back = -1;
    return 0;
}
function inflateReset(strm) {
    let state;
    if (!strm || !strm.state) return Z_STREAM_ERROR1;
    state = strm.state;
    state.wsize = 0;
    state.whave = 0;
    state.wnext = 0;
    return inflateResetKeep(strm);
}
function inflateReset2(strm, windowBits) {
    let wrap;
    let state;
    if (!strm || !strm.state) return Z_STREAM_ERROR1;
    state = strm.state;
    if (windowBits < 0) {
        wrap = 0;
        windowBits = -windowBits;
    } else {
        wrap = (windowBits >> 4) + 1;
        if (windowBits < 48) {
            windowBits &= 15;
        }
    }
    if (windowBits && (windowBits < 8 || windowBits > 15)) {
        return Z_STREAM_ERROR1;
    }
    if (state.window !== null && state.wbits !== windowBits) {
        state.window = null;
    }
    state.wrap = wrap;
    state.wbits = windowBits;
    return inflateReset(strm);
}
function inflateInit2(strm, windowBits) {
    let ret;
    let state;
    if (!strm) return Z_STREAM_ERROR1;
    state = new InflateState();
    strm.state = state;
    state.window = null;
    ret = inflateReset2(strm, windowBits);
    if (ret !== 0) {
        strm.state = null;
    }
    return ret;
}
let virgin = true;
let lenfix, distfix;
function fixedtables(state) {
    if (virgin) {
        let sym;
        lenfix = new Uint32Array(512);
        distfix = new Uint32Array(32);
        sym = 0;
        while(sym < 144)state.lens[sym++] = 8;
        while(sym < 256)state.lens[sym++] = 9;
        while(sym < 280)state.lens[sym++] = 7;
        while(sym < 288)state.lens[sym++] = 8;
        inflate_table(1, state.lens, 0, 288, lenfix, 0, state.work, {
            bits: 9
        });
        sym = 0;
        while(sym < 32)state.lens[sym++] = 5;
        inflate_table(2, state.lens, 0, 32, distfix, 0, state.work, {
            bits: 5
        });
        virgin = false;
    }
    state.lencode = lenfix;
    state.lenbits = 9;
    state.distcode = distfix;
    state.distbits = 5;
}
function updatewindow(strm, src, end, copy) {
    let dist;
    let state = strm.state;
    if (state.window === null) {
        state.wsize = 1 << state.wbits;
        state.wnext = 0;
        state.whave = 0;
        state.window = new Uint8Array(state.wsize);
    }
    if (copy >= state.wsize) {
        state.window.set(src.subarray(end - state.wsize, end), 0);
        state.wnext = 0;
        state.whave = state.wsize;
    } else {
        dist = state.wsize - state.wnext;
        if (dist > copy) {
            dist = copy;
        }
        state.window.set(src.subarray(end - copy, end - copy + dist), state.wnext);
        copy -= dist;
        if (copy) {
            state.window.set(src.subarray(end - copy, end), 0);
            state.wnext = copy;
            state.whave = state.wsize;
        } else {
            state.wnext += dist;
            if (state.wnext === state.wsize) state.wnext = 0;
            if (state.whave < state.wsize) state.whave += dist;
        }
    }
    return 0;
}
function inflate2(strm, flush) {
    let state;
    let input, output;
    let next;
    let put;
    let have, left;
    let hold;
    let bits;
    let _in, _out;
    let copy;
    let from;
    let from_source;
    let here = 0;
    let here_bits, here_op, here_val;
    let last_bits, last_op, last_val;
    let len;
    let ret;
    let hbuf = new Uint8Array(4);
    let opts;
    let n;
    let order = [
        16,
        17,
        18,
        0,
        8,
        7,
        9,
        6,
        10,
        5,
        11,
        4,
        12,
        3,
        13,
        2,
        14,
        1,
        15
    ];
    if (!strm || !strm.state || !strm.output || !strm.input && strm.avail_in !== 0) {
        return Z_STREAM_ERROR1;
    }
    state = strm.state;
    if (state.mode === 12) state.mode = TYPEDO;
    put = strm.next_out;
    output = strm.output;
    left = strm.avail_out;
    next = strm.next_in;
    input = strm.input;
    have = strm.avail_in;
    hold = state.hold;
    bits = state.bits;
    _in = have;
    _out = left;
    ret = Z_OK;
    inf_leave: for(;;){
        switch(state.mode){
            case 1:
                if (state.wrap === 0) {
                    state.mode = TYPEDO;
                    break;
                }
                while(bits < 16){
                    if (have === 0) break inf_leave;
                    have--;
                    hold += input[next++] << bits;
                    bits += 8;
                }
                if (state.wrap & 2 && hold === 35615) {
                    state.check = 0;
                    hbuf[0] = hold & 255;
                    hbuf[1] = hold >>> 8 & 255;
                    state.check = crc32(state.check, hbuf, 2, 0);
                    hold = 0;
                    bits = 0;
                    state.mode = FLAGS;
                    break;
                }
                state.flags = 0;
                if (state.head) {
                    state.head.done = false;
                }
                if (!(state.wrap & 1) || (((hold & 255) << 8) + (hold >> 8)) % 31) {
                    strm.msg = "incorrect header check";
                    state.mode = BAD1;
                    break;
                }
                if ((hold & 15) !== 8) {
                    strm.msg = "unknown compression method";
                    state.mode = BAD1;
                    break;
                }
                hold >>>= 4;
                bits -= 4;
                len = (hold & 15) + 8;
                if (state.wbits === 0) {
                    state.wbits = len;
                } else if (len > state.wbits) {
                    strm.msg = "invalid window size";
                    state.mode = BAD1;
                    break;
                }
                state.dmax = 1 << len;
                strm.adler = state.check = 1;
                state.mode = hold & 512 ? DICTID : TYPE1;
                hold = 0;
                bits = 0;
                break;
            case 2:
                while(bits < 16){
                    if (have === 0) break inf_leave;
                    have--;
                    hold += input[next++] << bits;
                    bits += 8;
                }
                state.flags = hold;
                if ((state.flags & 255) !== 8) {
                    strm.msg = "unknown compression method";
                    state.mode = BAD1;
                    break;
                }
                if (state.flags & 57344) {
                    strm.msg = "unknown header flags set";
                    state.mode = BAD1;
                    break;
                }
                if (state.head) {
                    state.head.text = hold >> 8 & 1;
                }
                if (state.flags & 512) {
                    hbuf[0] = hold & 255;
                    hbuf[1] = hold >>> 8 & 255;
                    state.check = crc32(state.check, hbuf, 2, 0);
                }
                hold = 0;
                bits = 0;
                state.mode = TIME;
            case 3:
                while(bits < 32){
                    if (have === 0) break inf_leave;
                    have--;
                    hold += input[next++] << bits;
                    bits += 8;
                }
                if (state.head) {
                    state.head.time = hold;
                }
                if (state.flags & 512) {
                    hbuf[0] = hold & 255;
                    hbuf[1] = hold >>> 8 & 255;
                    hbuf[2] = hold >>> 16 & 255;
                    hbuf[3] = hold >>> 24 & 255;
                    state.check = crc32(state.check, hbuf, 4, 0);
                }
                hold = 0;
                bits = 0;
                state.mode = OS;
            case 4:
                while(bits < 16){
                    if (have === 0) break inf_leave;
                    have--;
                    hold += input[next++] << bits;
                    bits += 8;
                }
                if (state.head) {
                    state.head.xflags = hold & 255;
                    state.head.os = hold >> 8;
                }
                if (state.flags & 512) {
                    hbuf[0] = hold & 255;
                    hbuf[1] = hold >>> 8 & 255;
                    state.check = crc32(state.check, hbuf, 2, 0);
                }
                hold = 0;
                bits = 0;
                state.mode = EXLEN;
            case 5:
                if (state.flags & 1024) {
                    while(bits < 16){
                        if (have === 0) break inf_leave;
                        have--;
                        hold += input[next++] << bits;
                        bits += 8;
                    }
                    state.length = hold;
                    if (state.head) {
                        state.head.extra_len = hold;
                    }
                    if (state.flags & 512) {
                        hbuf[0] = hold & 255;
                        hbuf[1] = hold >>> 8 & 255;
                        state.check = crc32(state.check, hbuf, 2, 0);
                    }
                    hold = 0;
                    bits = 0;
                } else if (state.head) {
                    state.head.extra = null;
                }
                state.mode = EXTRA;
            case 6:
                if (state.flags & 1024) {
                    copy = state.length;
                    if (copy > have) copy = have;
                    if (copy) {
                        if (state.head) {
                            len = state.head.extra_len - state.length;
                            if (!state.head.extra) {
                                state.head.extra = new Array(state.head.extra_len);
                            }
                            state.head.extra.set(input.subarray(next, next + copy), len);
                        }
                        if (state.flags & 512) {
                            state.check = crc32(state.check, input, copy, next);
                        }
                        have -= copy;
                        next += copy;
                        state.length -= copy;
                    }
                    if (state.length) break inf_leave;
                }
                state.length = 0;
                state.mode = NAME;
            case 7:
                if (state.flags & 2048) {
                    if (have === 0) break inf_leave;
                    copy = 0;
                    do {
                        len = input[next + copy++];
                        if (state.head && len && state.length < 65536) {
                            state.head.name += String.fromCharCode(len);
                        }
                    }while (len && copy < have)
                    if (state.flags & 512) {
                        state.check = crc32(state.check, input, copy, next);
                    }
                    have -= copy;
                    next += copy;
                    if (len) break inf_leave;
                } else if (state.head) {
                    state.head.name = null;
                }
                state.length = 0;
                state.mode = COMMENT;
            case 8:
                if (state.flags & 4096) {
                    if (have === 0) break inf_leave;
                    copy = 0;
                    do {
                        len = input[next + copy++];
                        if (state.head && len && state.length < 65536) {
                            state.head.comment += String.fromCharCode(len);
                        }
                    }while (len && copy < have)
                    if (state.flags & 512) {
                        state.check = crc32(state.check, input, copy, next);
                    }
                    have -= copy;
                    next += copy;
                    if (len) break inf_leave;
                } else if (state.head) {
                    state.head.comment = null;
                }
                state.mode = HCRC;
            case 9:
                if (state.flags & 512) {
                    while(bits < 16){
                        if (have === 0) break inf_leave;
                        have--;
                        hold += input[next++] << bits;
                        bits += 8;
                    }
                    if (hold !== (state.check & 65535)) {
                        strm.msg = "header crc mismatch";
                        state.mode = BAD1;
                        break;
                    }
                    hold = 0;
                    bits = 0;
                }
                if (state.head) {
                    state.head.hcrc = state.flags >> 9 & 1;
                    state.head.done = true;
                }
                strm.adler = state.check = 0;
                state.mode = TYPE1;
                break;
            case 10:
                while(bits < 32){
                    if (have === 0) break inf_leave;
                    have--;
                    hold += input[next++] << bits;
                    bits += 8;
                }
                strm.adler = state.check = zswap32(hold);
                hold = 0;
                bits = 0;
                state.mode = DICT;
            case 11:
                if (state.havedict === 0) {
                    strm.next_out = put;
                    strm.avail_out = left;
                    strm.next_in = next;
                    strm.avail_in = have;
                    state.hold = hold;
                    state.bits = bits;
                    return 2;
                }
                strm.adler = state.check = 1;
                state.mode = TYPE1;
            case 12:
                if (flush === 5 || flush === 6) break inf_leave;
            case 13:
                if (state.last) {
                    hold >>>= bits & 7;
                    bits -= bits & 7;
                    state.mode = CHECK;
                    break;
                }
                while(bits < 3){
                    if (have === 0) break inf_leave;
                    have--;
                    hold += input[next++] << bits;
                    bits += 8;
                }
                state.last = hold & 1;
                hold >>>= 1;
                bits -= 1;
                switch(hold & 3){
                    case 0:
                        state.mode = STORED;
                        break;
                    case 1:
                        fixedtables(state);
                        state.mode = LEN_;
                        if (flush === 6) {
                            hold >>>= 2;
                            bits -= 2;
                            break inf_leave;
                        }
                        break;
                    case 2:
                        state.mode = TABLE;
                        break;
                    case 3:
                        strm.msg = "invalid block type";
                        state.mode = BAD1;
                }
                hold >>>= 2;
                bits -= 2;
                break;
            case 14:
                hold >>>= bits & 7;
                bits -= bits & 7;
                while(bits < 32){
                    if (have === 0) break inf_leave;
                    have--;
                    hold += input[next++] << bits;
                    bits += 8;
                }
                if ((hold & 65535) !== (hold >>> 16 ^ 65535)) {
                    strm.msg = "invalid stored block lengths";
                    state.mode = BAD1;
                    break;
                }
                state.length = hold & 65535;
                hold = 0;
                bits = 0;
                state.mode = COPY_;
                if (flush === 6) break inf_leave;
            case 15:
                state.mode = COPY;
            case 16:
                copy = state.length;
                if (copy) {
                    if (copy > have) copy = have;
                    if (copy > left) copy = left;
                    if (copy === 0) break inf_leave;
                    output.set(input.subarray(next, next + copy), put);
                    have -= copy;
                    next += copy;
                    left -= copy;
                    put += copy;
                    state.length -= copy;
                    break;
                }
                state.mode = TYPE1;
                break;
            case 17:
                while(bits < 14){
                    if (have === 0) break inf_leave;
                    have--;
                    hold += input[next++] << bits;
                    bits += 8;
                }
                state.nlen = (hold & 31) + 257;
                hold >>>= 5;
                bits -= 5;
                state.ndist = (hold & 31) + 1;
                hold >>>= 5;
                bits -= 5;
                state.ncode = (hold & 15) + 4;
                hold >>>= 4;
                bits -= 4;
                if (state.nlen > 286 || state.ndist > 30) {
                    strm.msg = "too many length or distance symbols";
                    state.mode = BAD1;
                    break;
                }
                state.have = 0;
                state.mode = LENLENS;
            case 18:
                while(state.have < state.ncode){
                    while(bits < 3){
                        if (have === 0) break inf_leave;
                        have--;
                        hold += input[next++] << bits;
                        bits += 8;
                    }
                    state.lens[order[state.have++]] = hold & 7;
                    hold >>>= 3;
                    bits -= 3;
                }
                while(state.have < 19){
                    state.lens[order[state.have++]] = 0;
                }
                state.lencode = state.lendyn;
                state.lenbits = 7;
                opts = {
                    bits: state.lenbits
                };
                ret = inflate_table(CODES, state.lens, 0, 19, state.lencode, 0, state.work, opts);
                state.lenbits = opts.bits;
                if (ret) {
                    strm.msg = "invalid code lengths set";
                    state.mode = BAD1;
                    break;
                }
                state.have = 0;
                state.mode = CODELENS;
            case 19:
                while(state.have < state.nlen + state.ndist){
                    for(;;){
                        here = state.lencode[hold & (1 << state.lenbits) - 1];
                        here_bits = here >>> 24;
                        here_op = here >>> 16 & 255;
                        here_val = here & 65535;
                        if (here_bits <= bits) break;
                        if (have === 0) break inf_leave;
                        have--;
                        hold += input[next++] << bits;
                        bits += 8;
                    }
                    if (here_val < 16) {
                        hold >>>= here_bits;
                        bits -= here_bits;
                        state.lens[state.have++] = here_val;
                    } else {
                        if (here_val === 16) {
                            n = here_bits + 2;
                            while(bits < n){
                                if (have === 0) break inf_leave;
                                have--;
                                hold += input[next++] << bits;
                                bits += 8;
                            }
                            hold >>>= here_bits;
                            bits -= here_bits;
                            if (state.have === 0) {
                                strm.msg = "invalid bit length repeat";
                                state.mode = BAD1;
                                break;
                            }
                            len = state.lens[state.have - 1];
                            copy = 3 + (hold & 3);
                            hold >>>= 2;
                            bits -= 2;
                        } else if (here_val === 17) {
                            n = here_bits + 3;
                            while(bits < n){
                                if (have === 0) break inf_leave;
                                have--;
                                hold += input[next++] << bits;
                                bits += 8;
                            }
                            hold >>>= here_bits;
                            bits -= here_bits;
                            len = 0;
                            copy = 3 + (hold & 7);
                            hold >>>= 3;
                            bits -= 3;
                        } else {
                            n = here_bits + 7;
                            while(bits < n){
                                if (have === 0) break inf_leave;
                                have--;
                                hold += input[next++] << bits;
                                bits += 8;
                            }
                            hold >>>= here_bits;
                            bits -= here_bits;
                            len = 0;
                            copy = 11 + (hold & 127);
                            hold >>>= 7;
                            bits -= 7;
                        }
                        if (state.have + copy > state.nlen + state.ndist) {
                            strm.msg = "invalid bit length repeat";
                            state.mode = BAD1;
                            break;
                        }
                        while(copy--){
                            state.lens[state.have++] = len;
                        }
                    }
                }
                if (state.mode === 30) break;
                if (state.lens[256] === 0) {
                    strm.msg = "invalid code -- missing end-of-block";
                    state.mode = BAD1;
                    break;
                }
                state.lenbits = 9;
                opts = {
                    bits: state.lenbits
                };
                ret = inflate_table(LENS, state.lens, 0, state.nlen, state.lencode, 0, state.work, opts);
                state.lenbits = opts.bits;
                if (ret) {
                    strm.msg = "invalid literal/lengths set";
                    state.mode = BAD1;
                    break;
                }
                state.distbits = 6;
                state.distcode = state.distdyn;
                opts = {
                    bits: state.distbits
                };
                ret = inflate_table(DISTS, state.lens, state.nlen, state.ndist, state.distcode, 0, state.work, opts);
                state.distbits = opts.bits;
                if (ret) {
                    strm.msg = "invalid distances set";
                    state.mode = BAD1;
                    break;
                }
                state.mode = LEN_;
                if (flush === 6) break inf_leave;
            case 20:
                state.mode = LEN;
            case 21:
                if (have >= 6 && left >= 258) {
                    strm.next_out = put;
                    strm.avail_out = left;
                    strm.next_in = next;
                    strm.avail_in = have;
                    state.hold = hold;
                    state.bits = bits;
                    inflate_fast(strm, _out);
                    put = strm.next_out;
                    output = strm.output;
                    left = strm.avail_out;
                    next = strm.next_in;
                    input = strm.input;
                    have = strm.avail_in;
                    hold = state.hold;
                    bits = state.bits;
                    if (state.mode === 12) {
                        state.back = -1;
                    }
                    break;
                }
                state.back = 0;
                for(;;){
                    here = state.lencode[hold & (1 << state.lenbits) - 1];
                    here_bits = here >>> 24;
                    here_op = here >>> 16 & 255;
                    here_val = here & 65535;
                    if (here_bits <= bits) break;
                    if (have === 0) break inf_leave;
                    have--;
                    hold += input[next++] << bits;
                    bits += 8;
                }
                if (here_op && (here_op & 240) === 0) {
                    last_bits = here_bits;
                    last_op = here_op;
                    last_val = here_val;
                    for(;;){
                        here = state.lencode[last_val + ((hold & (1 << last_bits + last_op) - 1) >> last_bits)];
                        here_bits = here >>> 24;
                        here_op = here >>> 16 & 255;
                        here_val = here & 65535;
                        if (last_bits + here_bits <= bits) break;
                        if (have === 0) break inf_leave;
                        have--;
                        hold += input[next++] << bits;
                        bits += 8;
                    }
                    hold >>>= last_bits;
                    bits -= last_bits;
                    state.back += last_bits;
                }
                hold >>>= here_bits;
                bits -= here_bits;
                state.back += here_bits;
                state.length = here_val;
                if (here_op === 0) {
                    state.mode = LIT;
                    break;
                }
                if (here_op & 32) {
                    state.back = -1;
                    state.mode = TYPE1;
                    break;
                }
                if (here_op & 64) {
                    strm.msg = "invalid literal/length code";
                    state.mode = BAD1;
                    break;
                }
                state.extra = here_op & 15;
                state.mode = LENEXT;
            case 22:
                if (state.extra) {
                    n = state.extra;
                    while(bits < n){
                        if (have === 0) break inf_leave;
                        have--;
                        hold += input[next++] << bits;
                        bits += 8;
                    }
                    state.length += hold & (1 << state.extra) - 1;
                    hold >>>= state.extra;
                    bits -= state.extra;
                    state.back += state.extra;
                }
                state.was = state.length;
                state.mode = DIST;
            case 23:
                for(;;){
                    here = state.distcode[hold & (1 << state.distbits) - 1];
                    here_bits = here >>> 24;
                    here_op = here >>> 16 & 255;
                    here_val = here & 65535;
                    if (here_bits <= bits) break;
                    if (have === 0) break inf_leave;
                    have--;
                    hold += input[next++] << bits;
                    bits += 8;
                }
                if ((here_op & 240) === 0) {
                    last_bits = here_bits;
                    last_op = here_op;
                    last_val = here_val;
                    for(;;){
                        here = state.distcode[last_val + ((hold & (1 << last_bits + last_op) - 1) >> last_bits)];
                        here_bits = here >>> 24;
                        here_op = here >>> 16 & 255;
                        here_val = here & 65535;
                        if (last_bits + here_bits <= bits) break;
                        if (have === 0) break inf_leave;
                        have--;
                        hold += input[next++] << bits;
                        bits += 8;
                    }
                    hold >>>= last_bits;
                    bits -= last_bits;
                    state.back += last_bits;
                }
                hold >>>= here_bits;
                bits -= here_bits;
                state.back += here_bits;
                if (here_op & 64) {
                    strm.msg = "invalid distance code";
                    state.mode = BAD1;
                    break;
                }
                state.offset = here_val;
                state.extra = here_op & 15;
                state.mode = DISTEXT;
            case 24:
                if (state.extra) {
                    n = state.extra;
                    while(bits < n){
                        if (have === 0) break inf_leave;
                        have--;
                        hold += input[next++] << bits;
                        bits += 8;
                    }
                    state.offset += hold & (1 << state.extra) - 1;
                    hold >>>= state.extra;
                    bits -= state.extra;
                    state.back += state.extra;
                }
                if (state.offset > state.dmax) {
                    strm.msg = "invalid distance too far back";
                    state.mode = BAD1;
                    break;
                }
                state.mode = MATCH;
            case 25:
                if (left === 0) break inf_leave;
                copy = _out - left;
                if (state.offset > copy) {
                    copy = state.offset - copy;
                    if (copy > state.whave) {
                        if (state.sane) {
                            strm.msg = "invalid distance too far back";
                            state.mode = BAD1;
                            break;
                        }
                    }
                    if (copy > state.wnext) {
                        copy -= state.wnext;
                        from = state.wsize - copy;
                    } else {
                        from = state.wnext - copy;
                    }
                    if (copy > state.length) copy = state.length;
                    from_source = state.window;
                } else {
                    from_source = output;
                    from = put - state.offset;
                    copy = state.length;
                }
                if (copy > left) copy = left;
                left -= copy;
                state.length -= copy;
                do {
                    output[put++] = from_source[from++];
                }while (--copy)
                if (state.length === 0) state.mode = LEN;
                break;
            case 26:
                if (left === 0) break inf_leave;
                output[put++] = state.length;
                left--;
                state.mode = LEN;
                break;
            case 27:
                if (state.wrap) {
                    while(bits < 32){
                        if (have === 0) break inf_leave;
                        have--;
                        hold |= input[next++] << bits;
                        bits += 8;
                    }
                    _out -= left;
                    strm.total_out += _out;
                    state.total += _out;
                    if (_out) {
                        strm.adler = state.check = state.flags ? crc32(state.check, output, _out, put - _out) : adler32(state.check, output, _out, put - _out);
                    }
                    _out = left;
                    if ((state.flags ? hold : zswap32(hold)) !== state.check) {
                        strm.msg = "incorrect data check";
                        state.mode = BAD1;
                        break;
                    }
                    hold = 0;
                    bits = 0;
                }
                state.mode = LENGTH;
            case 28:
                if (state.wrap && state.flags) {
                    while(bits < 32){
                        if (have === 0) break inf_leave;
                        have--;
                        hold += input[next++] << bits;
                        bits += 8;
                    }
                    if (hold !== (state.total & 4294967295)) {
                        strm.msg = "incorrect length check";
                        state.mode = BAD1;
                        break;
                    }
                    hold = 0;
                    bits = 0;
                }
                state.mode = DONE;
            case 29:
                ret = Z_STREAM_END;
                break inf_leave;
            case 30:
                ret = Z_DATA_ERROR;
                break inf_leave;
            case 31:
                return Z_MEM_ERROR;
            case 32:
            default:
                return Z_STREAM_ERROR1;
        }
    }
    strm.next_out = put;
    strm.avail_out = left;
    strm.next_in = next;
    strm.avail_in = have;
    state.hold = hold;
    state.bits = bits;
    if (state.wsize || _out !== strm.avail_out && state.mode < 30 && (state.mode < 27 || flush !== 4)) {
        if (updatewindow(strm, strm.output, strm.next_out, _out - strm.avail_out)) {
            state.mode = MEM;
            return Z_MEM_ERROR;
        }
    }
    _in -= strm.avail_in;
    _out -= strm.avail_out;
    strm.total_in += _in;
    strm.total_out += _out;
    state.total += _out;
    if (state.wrap && _out) {
        strm.adler = state.check = state.flags ? crc32(state.check, output, _out, strm.next_out - _out) : adler32(state.check, output, _out, strm.next_out - _out);
    }
    strm.data_type = state.bits + (state.last ? 64 : 0) + (state.mode === TYPE1 ? 128 : 0) + (state.mode === LEN_ || state.mode === COPY_ ? 256 : 0);
    if ((_in === 0 && _out === 0 || flush === 4) && ret === 0) {
        ret = Z_BUF_ERROR;
    }
    return ret;
}
function inflateEnd(strm) {
    if (!strm || !strm.state) {
        return Z_STREAM_ERROR1;
    }
    let state = strm.state;
    if (state.window) {
        state.window = null;
    }
    strm.state = null;
    return 0;
}
function inflateGetHeader(strm, head) {
    let state;
    if (!strm || !strm.state) return Z_STREAM_ERROR1;
    state = strm.state;
    if ((state.wrap & 2) === 0) return Z_STREAM_ERROR1;
    state.head = head;
    head.done = false;
    return 0;
}
function inflateSetDictionary(strm, dictionary) {
    let dictLength = dictionary.length;
    let state;
    let dictid;
    let ret;
    if (!strm || !strm.state) {
        return Z_STREAM_ERROR1;
    }
    state = strm.state;
    if (state.wrap !== 0 && state.mode !== 11) {
        return Z_STREAM_ERROR1;
    }
    if (state.mode === 11) {
        dictid = 1;
        dictid = adler32(dictid, dictionary, dictLength, 0);
        if (dictid !== state.check) {
            return Z_DATA_ERROR;
        }
    }
    ret = updatewindow(strm, dictionary, dictLength, dictLength);
    if (ret) {
        state.mode = MEM;
        return Z_MEM_ERROR;
    }
    state.havedict = 1;
    return 0;
}
class GZheader {
    text = 0;
    time = 0;
    xflags = 0;
    os = 0;
    extra = null;
    extra_len = 0;
    name = "";
    comment = "";
    hcrc = 0;
    done = false;
}
class Inflate {
    err = 0;
    msg = "";
    ended = false;
    strm;
    options;
    header;
    constructor(options2){
        this.options = {
            chunkSize: 16384,
            windowBits: 0,
            to: "",
            ...options2
        };
        const opt1 = this.options;
        if (opt1.raw && opt1.windowBits >= 0 && opt1.windowBits < 16) {
            opt1.windowBits = -opt1.windowBits;
            if (opt1.windowBits === 0) opt1.windowBits = -15;
        }
        if (opt1.windowBits >= 0 && opt1.windowBits < 16 && !(options2 && options2.windowBits)) {
            opt1.windowBits += 32;
        }
        if (opt1.windowBits > 15 && opt1.windowBits < 48) {
            if ((opt1.windowBits & 15) === 0) {
                opt1.windowBits |= 15;
            }
        }
        this.strm = new ZStream();
        this.strm.avail_out = 0;
        var status2 = inflateInit2(this.strm, opt1.windowBits);
        if (status2 !== STATUS.Z_OK) {
            throw new Error(message9[status2]);
        }
        this.header = new GZheader();
        inflateGetHeader(this.strm, this.header);
        if (opt1.dictionary) {
            if (opt1.raw) {
                status2 = inflateSetDictionary(this.strm, opt1.dictionary);
                if (status2 !== STATUS.Z_OK) {
                    throw new Error(message9[status2]);
                }
            }
        }
    }
    push(data, mode) {
        const strm = this.strm;
        const chunkSize = this.options.chunkSize;
        const dictionary = this.options.dictionary;
        const chunks = [];
        let status;
        var allowBufError = false;
        if (this.ended) {
            throw new Error("can not call after ended");
        }
        let _mode = mode === ~~mode ? mode : mode === true ? STATUS.Z_FINISH : STATUS.Z_NO_FLUSH;
        strm.input = data;
        strm.next_in = 0;
        strm.avail_in = strm.input.length;
        do {
            if (strm.avail_out === 0) {
                strm.output = new Uint8Array(chunkSize);
                strm.next_out = 0;
                strm.avail_out = chunkSize;
            }
            status = inflate2(strm, STATUS.Z_NO_FLUSH);
            if (status === STATUS.Z_NEED_DICT && dictionary) {
                status = inflateSetDictionary(this.strm, dictionary);
            }
            if (status === STATUS.Z_BUF_ERROR && allowBufError === true) {
                status = STATUS.Z_OK;
                allowBufError = false;
            }
            if (status !== STATUS.Z_STREAM_END && status !== STATUS.Z_OK) {
                this.ended = true;
                throw new Error(this.strm.msg);
            }
            if (strm.next_out) {
                if (strm.avail_out === 0 || status === STATUS.Z_STREAM_END || strm.avail_in === 0 && (_mode === STATUS.Z_FINISH || _mode === STATUS.Z_SYNC_FLUSH)) {
                    chunks.push(strm.output.subarray(0, strm.next_out));
                }
            }
            if (strm.avail_in === 0 && strm.avail_out === 0) {
                allowBufError = true;
            }
        }while ((strm.avail_in > 0 || strm.avail_out === 0) && status !== STATUS.Z_STREAM_END)
        if (status === STATUS.Z_STREAM_END) {
            _mode = STATUS.Z_FINISH;
        }
        if (_mode === STATUS.Z_FINISH) {
            status = inflateEnd(this.strm);
            this.ended = true;
            if (status !== STATUS.Z_OK) throw new Error(this.strm.msg);
        }
        if (_mode === STATUS.Z_SYNC_FLUSH) {
            strm.avail_out = 0;
        }
        return concatUint8Array(chunks);
    }
}
function inflate1(input, options = {
}) {
    const inflator = new Inflate(options);
    const result = inflator.push(input, true);
    if (inflator.err) throw inflator.msg || message9[inflator.err];
    return result;
}
function inflateRaw(input, options = {
}) {
    options.raw = true;
    return inflate1(input, options);
}
const compressionMethods = {
    "deflate": 8
};
const possibleFlags = {
    "FTEXT": 1,
    "FHCRC": 2,
    "FEXTRA": 4,
    "FNAME": 8,
    "FCOMMENT": 16
};
const os1 = {
    "darwin": 3,
    "linux": 3,
    "windows": 0
};
const osCode = os1[Deno.build.os] ?? 255;
function putByte(n, arr) {
    arr.push(n & 255);
}
function putShort(n, arr) {
    arr.push(n & 255);
    arr.push(n >>> 8);
}
function putLong(n, arr) {
    putShort(n & 65535, arr);
    putShort(n >>> 16, arr);
}
function putString(s, arr) {
    for(let i = 0, len = s.length; i < len; i += 1){
        putByte(s.charCodeAt(i), arr);
    }
}
function readByte(arr) {
    return arr.shift();
}
function readShort(arr) {
    return arr.shift() | arr.shift() << 8;
}
function readLong(arr) {
    const n1 = readShort(arr);
    let n2 = readShort(arr);
    if (n2 > 32768) {
        n2 -= 32768;
        return (n2 << 16 | n1) + 32768 * Math.pow(2, 16);
    }
    return n2 << 16 | n1;
}
function readString(arr) {
    const charArr = [];
    while(arr[0] !== 0){
        charArr.push(String.fromCharCode(arr.shift()));
    }
    arr.shift();
    return charArr.join("");
}
function readBytes(arr, n) {
    const ret = [];
    for(let i = 0; i < n; i += 1){
        ret.push(arr.shift());
    }
    return ret;
}
function getHeader(options = {
}) {
    let flags = 0;
    const level = options.level ?? 6;
    const out = [];
    putByte(31, out);
    putByte(139, out);
    putByte(compressionMethods["deflate"], out);
    if (options.name) {
        flags |= possibleFlags["FNAME"];
    }
    putByte(flags, out);
    putLong(options.timestamp ?? Math.floor(Date.now() / 1000), out);
    if (level === 1) {
        putByte(4, out);
    } else if (level === 9) {
        putByte(2, out);
    } else {
        putByte(0, out);
    }
    putByte(osCode, out);
    if (options.name) {
        putString(options.name.substring(options.name.lastIndexOf("/") + 1), out);
        putByte(0, out);
    }
    return new Uint8Array(out);
}
function checkHeader(arr) {
    if (readByte(arr) !== 31 || readByte(arr) !== 139) {
        throw "Not a GZIP file";
    }
    if (readByte(arr) !== 8) {
        throw "Unsupported compression method";
    }
    const flags = readByte(arr);
    readLong(arr);
    readByte(arr);
    readByte(arr);
    if (flags & possibleFlags["FEXTRA"]) {
        const t = readShort(arr);
        readBytes(arr, t);
    }
    if (flags & possibleFlags["FNAME"]) {
        readString(arr);
    }
    if (flags & possibleFlags["FCOMMENT"]) {
        readString(arr);
    }
    if (flags & possibleFlags["FHCRC"]) {
        readShort(arr);
    }
}
function checkTail(arr) {
    const tail = arr.splice(arr.length - 8);
    const crc32 = readLong(tail) >>> 0;
    const size = readLong(tail);
    return {
        crc32,
        size
    };
}
class Writer extends EventEmitter {
    writer;
    bytesWritten = 0;
    path;
    chuncks = [];
    onceSize;
    chuncksBytes = 0;
    crc32Stream = new Crc32Stream();
    deflate = new Deflate({
        raw: true
    });
    constructor(path1, options3){
        super();
        this.path = path1;
        this.onceSize = options3?.onceSize ?? 1024 * 1024;
    }
    async setup(name, timestamp) {
        this.writer = await Deno.open(this.path, {
            write: true,
            create: true,
            truncate: true
        });
        const headers = getHeader({
            timestamp,
            name
        });
        await Deno.write(this.writer.rid, headers);
    }
    async write(p) {
        const readed = p.byteLength;
        const copy = new Uint8Array(p);
        this.chuncks.push(copy);
        this.chuncksBytes += readed;
        this.bytesWritten += readed;
        this.crc32Stream.append(copy);
        if (readed < 16384) {
            const buf = concatUint8Array(this.chuncks);
            const compressed = this.deflate.push(buf, true);
            await writeAll(this.writer, compressed);
            const tail = this.getTail();
            await Deno.write(this.writer.rid, tail);
        } else if (this.chuncksBytes >= this.onceSize) {
            const buf = concatUint8Array(this.chuncks);
            const compressed = this.deflate.push(buf, false);
            await writeAll(this.writer, compressed);
            this.chuncks.length = 0;
            this.chuncksBytes = 0;
            this.emit("bytesWritten", this.bytesWritten);
        }
        return readed;
    }
    close() {
        this.emit("bytesWritten", this.bytesWritten);
        Deno.close(this.writer.rid);
    }
    getTail() {
        const arr = [];
        putLong(parseInt(this.crc32Stream.crc32, 16), arr);
        putLong(this.bytesWritten, arr);
        return new Uint8Array(arr);
    }
}
class Writer1 extends EventEmitter {
    writer;
    bytesWritten = 0;
    path;
    chuncks = [];
    onceSize;
    chuncksBytes = 0;
    isCheckHeader = false;
    writtenSize = 0;
    crc32Stream = new Crc32Stream();
    inflate = new Inflate({
        raw: true
    });
    constructor(path2, options4){
        super();
        this.path = path2;
        this.onceSize = options4?.onceSize ?? 1024 * 1024;
    }
    async setup() {
        this.writer = await Deno.open(this.path, {
            write: true,
            create: true,
            truncate: true
        });
    }
    async write(p) {
        const readed = p.byteLength;
        this.chuncksBytes += readed;
        this.bytesWritten += readed;
        const arr = Array.from(p);
        if (!this.isCheckHeader) {
            this.isCheckHeader = true;
            checkHeader(arr);
        }
        if (readed < 16384) {
            const { size , crc32  } = checkTail(arr);
            this.chuncks.push(new Uint8Array(arr));
            const buf = concatUint8Array(this.chuncks);
            const decompressed = this.inflate.push(buf, true);
            this.writtenSize += decompressed.byteLength;
            await writeAll(this.writer, decompressed);
            this.crc32Stream.append(decompressed);
            if (crc32 !== parseInt(this.crc32Stream.crc32, 16)) {
                throw "Checksum does not match";
            }
            if (size !== this.writtenSize) {
                throw "Size of decompressed file not correct";
            }
            return readed;
        }
        this.chuncks.push(new Uint8Array(arr));
        if (this.chuncksBytes >= this.onceSize) {
            const buf = concatUint8Array(this.chuncks);
            const decompressed = this.inflate.push(buf, false);
            this.writtenSize += decompressed.byteLength;
            await writeAll(this.writer, decompressed);
            this.crc32Stream.append(decompressed);
            this.chuncks.length = 0;
            this.chuncksBytes = 0;
            this.emit("bytesWritten", this.bytesWritten);
        }
        return readed;
    }
    close() {
        this.emit("bytesWritten", this.bytesWritten);
        Deno.close(this.writer.rid);
    }
}
class GzipStream extends EventEmitter {
    constructor(){
        super();
    }
    async compress(src, dest) {
        const stat = await Deno.stat(src);
        const size = stat.size;
        const reader = await Deno.open(src, {
            read: true
        });
        const writer = new Writer(dest, {
            onceSize: size > 50 * 1024 * 1024 ? 1024 * 1024 : 512 * 1024
        });
        await writer.setup(src, stat.mtime ? Math.round(stat.mtime.getTime() / 1000) : 0);
        writer.on("bytesWritten", (bytesWritten)=>{
            const progress = (100 * bytesWritten / size).toFixed(2) + "%";
            this.emit("progress", progress);
        });
        await copy1(reader, writer, {
            bufSize: 1024 * 1024
        });
        writer.close();
        reader.close();
    }
    async uncompress(src, dest) {
        const size = (await Deno.stat(src)).size;
        const reader = await Deno.open(src, {
            read: true
        });
        const writer = new Writer1(dest, {
            onceSize: size > 50 * 1024 * 1024 ? 1024 * 1024 : 512 * 1024
        });
        await writer.setup();
        writer.on("bytesWritten", (bytesWritten)=>{
            const progress = (100 * bytesWritten / size).toFixed(2) + "%";
            this.emit("progress", progress);
        });
        await copy1(reader, writer, {
            bufSize: 1024 * 1024
        });
        writer.close();
        reader.close();
    }
}
function decode(b64) {
    const binString = atob(b64);
    const size = binString.length;
    const bytes = new Uint8Array(size);
    for(let i = 0; i < size; i++){
        bytes[i] = binString.charCodeAt(i);
    }
    return bytes;
}
function addPaddingToBase64url(base64url) {
    if (base64url.length % 4 === 2) return base64url + "==";
    if (base64url.length % 4 === 3) return base64url + "=";
    if (base64url.length % 4 === 1) {
        throw new TypeError("Illegal base64url string!");
    }
    return base64url;
}
function convertBase64urlToBase64(b64url) {
    return addPaddingToBase64url(b64url).replace(/\-/g, "+").replace(/_/g, "/");
}
function decode1(b64url) {
    return decode(convertBase64urlToBase64(b64url));
}
const input_raw = await Deno.readTextFile("raw-2");
const input_token = String.fromCodePoint(...input_raw.replaceAll(/\D/g, "").match(/.{1,2}/g)?.map((c)=>+c + 45
));
const payload_b64url = input_token.split(".")[1];
const payload_bin = decode1(payload_b64url);
const decompressed = inflateRaw(payload_bin);
const payload_json_string = new TextDecoder("utf-8").decode(decompressed);
const json = JSON.parse(payload_json_string);
console.log(JSON.stringify(json, null, 2));
