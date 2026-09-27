// records.js：定长记录的打包（字段按位宽左边补零）与校验和（和模 256，两位小写十六进制）
export function packRecord(values, widths) {
  return values.map(function (value, index) {
    return String(value).padStart(widths[index], "0");
  });
}

export function checksumOf(values) {
  const sum = values.reduce(function (acc, value) { return acc + value; }, 0);
  return (sum % 256).toString(16).padStart(2, "0");
}
