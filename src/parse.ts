import { inflateRaw } from "https://deno.land/x/compress@v0.4.1/mod.ts";
import {
  decode as base64UrlDecode,
} from "https://deno.land/std@0.82.0/encoding/base64url.ts";

export function parseShc(inputRaw: string) {
  // const input_raw = await Deno.readTextFile("raw-2");
  const inputToken = String.fromCodePoint(...inputRaw
    .replaceAll(/\D/g, "") // strips the "shc:/"
    .match(/.{1,2}/g) // groups of 2
    ?.map((c) => +c + 45) as number[]); // converts to number and + 45

  const payloadBase64Url = inputToken.split(".")[1]; // gets only the payload
  const payloadBin = base64UrlDecode(payloadBase64Url); // it's a base64Url so it has '_' and '-'
  const decompressed = inflateRaw(payloadBin); // reverses the compression specified by { "zip":"DEF", ... }
  const payloadJsonString = new TextDecoder("utf-8") // back to a human readible
    .decode(decompressed);

  const json = JSON.parse(payloadJsonString);

  console.log(JSON.stringify(json, null, 2));

  return json;
}
