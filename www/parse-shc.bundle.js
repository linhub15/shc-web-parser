const WSIZE = 32768;
const lbits = 9;
const dbits = 6;
let slide;
let wp;
let fixed_tl = null;
let fixed_td;
let fixed_bl;
let fixed_bd;
let bit_buf;
let bit_len;
let method;
let eof;
let copy_leng;
let copy_dist;
let tl;
let td;
let bl;
let bd;
let inflate_data;
let inflate_pos;
const MASK_BITS = [
    0,
    1,
    3,
    7,
    15,
    31,
    63,
    127,
    255,
    511,
    1023,
    2047,
    4095,
    8191,
    16383,
    32767,
    65535, 
];
const cplens = [
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
const cplext = [
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
    99,
    99
];
const cpdist = [
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
];
const cpdext = [
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
const border = [
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
class HuftList {
    next = null;
    list = null;
}
class HuftNode {
    e = 0;
    b = 0;
    n = 0;
    t = null;
}
class HuftBuild {
    BMAX = 16;
    N_MAX = 288;
    status = 0;
    root = null;
    m = 0;
    constructor(b1, n1, s, d, e1, mm){
        let a;
        let c = [];
        let el;
        let f;
        let g;
        let h;
        let i;
        let j;
        let k;
        let lx = [];
        let p;
        let pidx;
        let q;
        let r = new HuftNode();
        let u = [];
        let v = [];
        let w;
        let x = [];
        let xp;
        let y;
        let z;
        let o;
        let tail;
        tail = this.root = null;
        for(i = 0; i < this.BMAX + 1; i++){
            c[i] = 0;
        }
        for(i = 0; i < this.BMAX + 1; i++){
            lx[i] = 0;
        }
        for(i = 0; i < this.BMAX; i++){
            u[i] = null;
        }
        for(i = 0; i < this.N_MAX; i++){
            v[i] = 0;
        }
        for(i = 0; i < this.BMAX + 1; i++){
            x[i] = 0;
        }
        el = n1 > 256 ? b1[256] : this.BMAX;
        p = b1;
        pidx = 0;
        i = n1;
        do {
            c[p[pidx]]++;
            pidx++;
        }while (--i > 0)
        if (c[0] === n1) {
            this.root = null;
            this.m = 0;
            this.status = 0;
            return;
        }
        for(j = 1; j <= this.BMAX; j++){
            if (c[j] !== 0) {
                break;
            }
        }
        k = j;
        if (mm < j) {
            mm = j;
        }
        for(i = this.BMAX; i !== 0; i--){
            if (c[i] !== 0) {
                break;
            }
        }
        g = i;
        if (mm > i) {
            mm = i;
        }
        for(y = 1 << j; j < i; j++, y <<= 1){
            if ((y -= c[j]) < 0) {
                this.status = 2;
                this.m = mm;
                return;
            }
        }
        if ((y -= c[i]) < 0) {
            this.status = 2;
            this.m = mm;
            return;
        }
        c[i] += y;
        x[1] = j = 0;
        p = c;
        pidx = 1;
        xp = 2;
        while(--i > 0){
            x[xp++] = j += p[pidx++];
        }
        p = b1;
        pidx = 0;
        i = 0;
        do {
            if ((j = p[pidx++]) !== 0) {
                v[x[j]++] = i;
            }
        }while (++i < n1)
        n1 = x[g];
        x[0] = i = 0;
        p = v;
        pidx = 0;
        h = -1;
        w = lx[0] = 0;
        q = null;
        z = 0;
        for(null; k <= g; k++){
            a = c[k];
            while(a-- > 0){
                while(k > w + lx[1 + h]){
                    w += lx[1 + h];
                    h++;
                    z = (z = g - w) > mm ? mm : z;
                    if ((f = 1 << (j = k - w)) > a + 1) {
                        f -= a + 1;
                        xp = k;
                        while(++j < z){
                            if ((f <<= 1) <= c[++xp]) {
                                break;
                            }
                            f -= c[xp];
                        }
                    }
                    if (w + j > el && w < el) {
                        j = el - w;
                    }
                    z = 1 << j;
                    lx[1 + h] = j;
                    q = [];
                    for(o = 0; o < z; o++){
                        q[o] = new HuftNode();
                    }
                    if (!tail) {
                        tail = this.root = new HuftList();
                    } else {
                        tail = new HuftList();
                        tail.next = new HuftList();
                    }
                    tail.next = null;
                    tail.list = q;
                    u[h] = q;
                    if (h > 0) {
                        x[h] = i;
                        r.b = lx[h];
                        r.e = 16 + j;
                        r.t = q;
                        j = (i & (1 << w) - 1) >> w - lx[h];
                        const tmp = u[h - 1];
                        if (tmp) {
                            tmp[j].e = r.e;
                            tmp[j].b = r.b;
                            tmp[j].n = r.n;
                            tmp[j].t = r.t;
                        }
                    }
                }
                r.b = k - w;
                if (pidx >= n1) {
                    r.e = 99;
                } else if (p[pidx] < s) {
                    r.e = p[pidx] < 256 ? 16 : 15;
                    r.n = p[pidx++];
                } else {
                    if (e1) r.e = e1[p[pidx] - s];
                    if (d) r.n = d[p[pidx++] - s];
                }
                f = 1 << k - w;
                for(j = i >> w; j < z; j += f){
                    if (q) {
                        q[j].e = r.e;
                        q[j].b = r.b;
                        q[j].n = r.n;
                        q[j].t = r.t;
                    }
                }
                for(j = 1 << k - 1; (i & j) !== 0; j >>= 1){
                    i ^= j;
                }
                i ^= j;
                while((i & (1 << w) - 1) !== x[h]){
                    w -= lx[h];
                    h--;
                }
            }
        }
        this.m = lx[1];
        this.status = y !== 0 && g !== 1 ? 1 : 0;
    }
}
function GET_BYTE() {
    if (inflate_data.length === inflate_pos) {
        return -1;
    }
    return inflate_data[inflate_pos++] & 255;
}
function NEEDBITS(n) {
    while(bit_len < n){
        bit_buf |= GET_BYTE() << bit_len;
        bit_len += 8;
    }
}
function GETBITS(n) {
    return bit_buf & MASK_BITS[n];
}
function DUMPBITS(n) {
    bit_buf >>= n;
    bit_len -= n;
}
function inflate_codes(buff, off, size) {
    let e;
    let t;
    let n;
    if (size === 0) {
        return 0;
    }
    n = 0;
    for(;;){
        NEEDBITS(bl);
        if (!tl || !tl.list) break;
        t = tl.list[GETBITS(bl)];
        e = t.e;
        while(e > 16){
            if (e === 99) {
                return -1;
            }
            DUMPBITS(t.b);
            e -= 16;
            NEEDBITS(e);
            t = t.t[GETBITS(e)];
            e = t.e;
        }
        DUMPBITS(t.b);
        if (e === 16) {
            wp &= WSIZE - 1;
            buff[off + n++] = slide[wp++] = t.n;
            if (n === size) {
                return size;
            }
            continue;
        }
        if (e === 15) {
            break;
        }
        NEEDBITS(e);
        copy_leng = t.n + GETBITS(e);
        DUMPBITS(e);
        NEEDBITS(bd);
        t = td.list[GETBITS(bd)];
        e = t.e;
        while(e > 16){
            if (e === 99) {
                return -1;
            }
            DUMPBITS(t.b);
            e -= 16;
            NEEDBITS(e);
            t = t.t[GETBITS(e)];
            e = t.e;
        }
        DUMPBITS(t.b);
        NEEDBITS(e);
        copy_dist = wp - t.n - GETBITS(e);
        DUMPBITS(e);
        while(copy_leng > 0 && n < size){
            copy_leng--;
            copy_dist &= WSIZE - 1;
            wp &= WSIZE - 1;
            buff[off + n++] = slide[wp++] = slide[copy_dist++];
        }
        if (n === size) {
            return size;
        }
    }
    method = -1;
    return n;
}
function inflate_stored(buff, off, size) {
    let n;
    n = bit_len & 7;
    DUMPBITS(n);
    NEEDBITS(16);
    n = GETBITS(16);
    DUMPBITS(16);
    NEEDBITS(16);
    if (n !== (~bit_buf & 65535)) {
        return -1;
    }
    DUMPBITS(16);
    copy_leng = n;
    n = 0;
    while(copy_leng > 0 && n < size){
        copy_leng--;
        wp &= WSIZE - 1;
        NEEDBITS(8);
        buff[off + n++] = slide[wp++] = GETBITS(8);
        DUMPBITS(8);
    }
    if (copy_leng === 0) {
        method = -1;
    }
    return n;
}
function inflate_fixed(buff, off, size) {
    if (!fixed_tl) {
        let i;
        let l = [];
        let h;
        for(i = 0; i < 144; i++){
            l[i] = 8;
        }
        for(null; i < 256; i++){
            l[i] = 9;
        }
        for(null; i < 280; i++){
            l[i] = 7;
        }
        for(null; i < 288; i++){
            l[i] = 8;
        }
        fixed_bl = 7;
        h = new HuftBuild(l, 288, 257, cplens, cplext, fixed_bl);
        if (h.status !== 0) {
            console.error("HufBuild error: " + h.status);
            return -1;
        }
        fixed_tl = h.root;
        fixed_bl = h.m;
        for(i = 0; i < 30; i++){
            l[i] = 5;
        }
        fixed_bd = 5;
        h = new HuftBuild(l, 30, 0, cpdist, cpdext, fixed_bd);
        if (h.status > 1) {
            fixed_tl = null;
            console.error("HufBuild error: " + h.status);
            return -1;
        }
        fixed_td = h.root;
        fixed_bd = h.m;
    }
    tl = fixed_tl;
    td = fixed_td;
    bl = fixed_bl;
    bd = fixed_bd;
    return inflate_codes(buff, off, size);
}
function inflate_dynamic(buff, off, size) {
    let i;
    let j;
    let l;
    let n;
    let t;
    let nb;
    let nl;
    let nd;
    let ll = [];
    let h;
    for(i = 0; i < 286 + 30; i++){
        ll[i] = 0;
    }
    NEEDBITS(5);
    nl = 257 + GETBITS(5);
    DUMPBITS(5);
    NEEDBITS(5);
    nd = 1 + GETBITS(5);
    DUMPBITS(5);
    NEEDBITS(4);
    nb = 4 + GETBITS(4);
    DUMPBITS(4);
    if (nl > 286 || nd > 30) {
        return -1;
    }
    for(j = 0; j < nb; j++){
        NEEDBITS(3);
        ll[border[j]] = GETBITS(3);
        DUMPBITS(3);
    }
    for(null; j < 19; j++){
        ll[border[j]] = 0;
    }
    bl = 7;
    h = new HuftBuild(ll, 19, 19, null, null, bl);
    if (h.status !== 0) {
        return -1;
    }
    tl = h.root;
    bl = h.m;
    n = nl + nd;
    i = l = 0;
    while(i < n){
        NEEDBITS(bl);
        t = tl.list[GETBITS(bl)];
        j = t.b;
        DUMPBITS(j);
        j = t.n;
        if (j < 16) {
            ll[i++] = l = j;
        } else if (j === 16) {
            NEEDBITS(2);
            j = 3 + GETBITS(2);
            DUMPBITS(2);
            if (i + j > n) {
                return -1;
            }
            while(j-- > 0){
                ll[i++] = l;
            }
        } else if (j === 17) {
            NEEDBITS(3);
            j = 3 + GETBITS(3);
            DUMPBITS(3);
            if (i + j > n) {
                return -1;
            }
            while(j-- > 0){
                ll[i++] = 0;
            }
            l = 0;
        } else {
            NEEDBITS(7);
            j = 11 + GETBITS(7);
            DUMPBITS(7);
            if (i + j > n) {
                return -1;
            }
            while(j-- > 0){
                ll[i++] = 0;
            }
            l = 0;
        }
    }
    bl = lbits;
    h = new HuftBuild(ll, nl, 257, cplens, cplext, bl);
    if (bl === 0) {
        h.status = 1;
    }
    if (h.status !== 0) {
        if (h.status !== 1) {
            return -1;
        }
    }
    tl = h.root;
    bl = h.m;
    for(i = 0; i < nd; i++){
        ll[i] = ll[i + nl];
    }
    bd = dbits;
    h = new HuftBuild(ll, nd, 0, cpdist, cpdext, bd);
    td = h.root;
    bd = h.m;
    if (bd === 0 && nl > 257) {
        return -1;
    }
    if (h.status !== 0) {
        return -1;
    }
    return inflate_codes(buff, off, size);
}
function inflate_start() {
    if (!slide) {
        slide = [];
    }
    wp = 0;
    bit_buf = 0;
    bit_len = 0;
    method = -1;
    eof = false;
    copy_leng = copy_dist = 0;
    tl = null;
}
function inflate_internal(buff, off, size) {
    let n, i;
    n = 0;
    while(n < size){
        if (eof && method === -1) {
            return n;
        }
        if (copy_leng > 0) {
            if (method !== 0) {
                while(copy_leng > 0 && n < size){
                    copy_leng--;
                    copy_dist &= WSIZE - 1;
                    wp &= WSIZE - 1;
                    buff[off + n++] = slide[wp++] = slide[copy_dist++];
                }
            } else {
                while(copy_leng > 0 && n < size){
                    copy_leng--;
                    wp &= WSIZE - 1;
                    NEEDBITS(8);
                    buff[off + n++] = slide[wp++] = GETBITS(8);
                    DUMPBITS(8);
                }
                if (copy_leng === 0) {
                    method = -1;
                }
            }
            if (n === size) {
                return n;
            }
        }
        if (method === -1) {
            if (eof) {
                break;
            }
            NEEDBITS(1);
            if (GETBITS(1) !== 0) {
                eof = true;
            }
            DUMPBITS(1);
            NEEDBITS(2);
            method = GETBITS(2);
            DUMPBITS(2);
            tl = null;
            copy_leng = 0;
        }
        switch(method){
            case 0:
                i = inflate_stored(buff, off + n, size - n);
                break;
            case 1:
                if (tl) {
                    i = inflate_codes(buff, off + n, size - n);
                } else {
                    i = inflate_fixed(buff, off + n, size - n);
                }
                break;
            case 2:
                if (tl) {
                    i = inflate_codes(buff, off + n, size - n);
                } else {
                    i = inflate_dynamic(buff, off + n, size - n);
                }
                break;
            default:
                i = -1;
                break;
        }
        if (i === -1) {
            if (eof) {
                return 0;
            }
            return -1;
        }
        n += i;
    }
    return n;
}
function inflateRaw(arr) {
    let i;
    const buff = [];
    inflate_start();
    inflate_data = arr;
    inflate_pos = 0;
    do {
        i = inflate_internal(buff, buff.length, 1024);
    }while (i > 0)
    return new Uint8Array(buff);
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
function parseShc1(inputRaw) {
    const inputToken = String.fromCodePoint(...inputRaw.replaceAll(/\D/g, "").match(/.{1,2}/g)?.map((c)=>+c + 45
    ));
    const payloadBase64Url = inputToken.split(".")[1];
    const payloadBin = decode1(payloadBase64Url);
    const decompressed = inflateRaw(payloadBin);
    const payloadJsonString = new TextDecoder("utf-8").decode(decompressed);
    const json = JSON.parse(payloadJsonString);
    console.log(JSON.stringify(json, null, 2));
    return json;
}
export { parseShc1 as parseShc };
