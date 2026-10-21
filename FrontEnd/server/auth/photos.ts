import { AuthFlowError } from "./session";

export function imageType(bytes: Uint8Array): {
  extension: string;
  mime: string;
} {
  if (
    bytes.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)
  )
    return { extension: "png", mime: "image/png" };
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return { extension: "jpg", mime: "image/jpeg" };
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...bytes.slice(start, end));
  if (["GIF87a", "GIF89a"].includes(ascii(0, 6)))
    return { extension: "gif", mime: "image/gif" };
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP")
    return { extension: "webp", mime: "image/webp" };
  throw new AuthFlowError(
    "Envie uma imagem PNG, JPEG, GIF ou WebP válida.",
    400,
  );
}
