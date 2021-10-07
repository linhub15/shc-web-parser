# Parsing Alberta Smart Health Card 

https://smarthealth.cards/

Inspired by Mikkel Paulson [blog post](https://mikkel.ca/blog/digging-into-quebecs-proof-of-vaccination/)

## Dev Build
* start - `python3 -m http.server --directory www`
* build - `deno bundle src/parse.ts www/parse-shc.bundle.js`