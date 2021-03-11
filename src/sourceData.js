/**
 *  爬虫所爬取平台的对应代码
 */
const targetPlatformMap = new Map([
  ["xd", "https://xd.newrank.cn"],
  ["xk", "https://xk.newrank.cn"],
  ["xz", "https://xz.newrank.cn"],
  ["xs", "https://xs.newrank.cn"],
]);

const platformFilenameMap = new Map([
  ["xd", "xdIndex.html"],
  ["xk", "xkIndex.html"],
  ["xz", "xzIndex.html"],
  ["xs", "xsIndex.html"],
]);

module.exports = { targetPlatformMap, platformFilenameMap };
