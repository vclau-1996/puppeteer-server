/**
 * koa+puppeteer 实现截图
 */

const puppeteer = require("puppeteer");
const path = require("path");
const Koa = require("koa");
const Router = require("koa-router");
const fs = require("fs");
const bodyParser = require("koa-bodyparser"); // 请求Body数据处理中间件
const staticResource = require("koa-static"); // 静态资源管理中间件
const sourceData = require("./sourceData");

const app = new Koa();
const router = new Router();

const targetPlatformMap = sourceData.targetPlatformMap; // 爬取目标平台的Map
const platformFilenameMap = sourceData.platformFilenameMap; //爬取目标平台文件名的Map

// 浏览器websocket链接类，单例模式
class BrowserWs {
  // 浏览器websocket链接
  browserWsInstance = null;

  // 获取websocket链接
  static getInstance = async () => {
    let browser = null;
    if (!BrowserWs.browserWsInstance) {
      browser = await puppeteer.launch({
        // executablePath:
        //   "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
        headless: false,
        args: [
          "--disable-gpu", // 禁用gpu加速
          "--disable-dev-shm-usage", //优化内存过小chrome崩溃的问题
          "--disable-setuid-sandbox", //禁用沙盒模式
          "--no-first-run", //跳过首次运行任务
          "--no-sandbox", //禁用沙箱模式
          "--no-zygote",
          "--single-process",
          "--disable-extensions", //禁用扩展程序
        ],
      });
      const wsInstance = await browser.wsEndpoint();
      BrowserWs.browserWsInstance = wsInstance;
      return BrowserWs.browserWsInstance;
    } else {
      return BrowserWs.browserWsInstance;
    }
  };
}

app.use(bodyParser());
app.use(staticResource(__dirname, "./html"));
app.use(staticResource(__dirname, "./static"));

// 返回截图demo的html
router.get("/", async (ctx) => {
  ctx.response.type = "html";
  // ctx.body = fs.createReadStream("./html/screenShot.html");
  ctx.body = fs.createReadStream(require.resolve("./html/screenShot.html"));
});
// 返回爬虫demo的html
router.get("/spider", async (ctx) => {
  ctx.response.type = "html";
  ctx.body = fs.createReadStream(require.resolve("./html/spiderIndex.html"));
});

/**
 * 截图服务
 *
 * @param {string} url:希望截取的目标网页url
 * @param {string} fileName:下载的文件名称
 * @param {number} quality:截图质量（仅能作用与jpeg格式的截图）
 * @param {string} imgType:图片类型（仅支持jpeg和png）
 * @param {string} selector:dom选择器
 */
router.post("/screenShot", async (ctx, next) => {
  ctx.type = "json";
  let { url, fileName, quality, imgType = "png", selector } = ctx.request.body;
  let result = {};
  console.time("screenShot");
  console.log("传入参数", ctx.request.body);
  try {
    // 未传入url
    if (!url) {
      result = { code: 4014, msg: "传入参数有误" };
      ctx.body = result;
      return;
    }
    // 未传入https开头的url
    if (!/^https:\/\//.test(url)) {
      result = { code: 4000, msg: "只能对https://网站进行截图" };
      ctx.body = result;
      return;
    }
    let element;
    //  生成随机文件名
    const randomFileName = parseInt(Math.random() * 100000);

    // 创建浏览器websocket链接
    const browserWsInstance = await BrowserWs.getInstance();
    // 重新通过websocket链接浏览器
    const browSer = await puppeteer.connect({
      browserWSEndpoint: browserWsInstance,
    });

    // 生成页面
    const page = await browSer.newPage();
    // 设置视口大小
    await page.setViewport({ width: 1920, height: 800 });
    // 页面跳转
    await page.goto(url, { waitUntil: "load" });

    // 如果传入了dom选择器，则尝试从页面中获取dom元素
    if (selector) {
      try {
        element = await page.$(selector);
      } catch (error) {}
    }
    // 存在dom元素，则针对dom元素截图
    if (element) {
      await element.screenshot({
        path: path.join(__dirname, `./static/${randomFileName}.${imgType}`), //图片保存路径
        type: imgType,
        quality: quality ? Number(quality) : undefined,
      });
    }
    // 不存在dom元素，全屏截图
    else {
      await page.screenshot({
        path: path.join(__dirname, `./static/${randomFileName}.${imgType}`), //图片保存路径
        type: imgType,
        quality: quality ? Number(quality) : undefined,
        fullPage: true, //边滚动边截图
      });
    }
    result = {
      code: 2000,
      msg: "下载成功",
      dataUrl: ctx.origin + `/static/${randomFileName}.${imgType}`,
      fileName: fileName || `截图.${imgType}`,
    };
    // 完成截图后关闭浏览器，避免内存泄露
    await page.close();
  } catch (error) {
    console.log("截图服务错误：", error);
    result = { code: 4000, msg: "接口错误" };
  }
  console.log(result);
  console.timeEnd("screenShot");
  ctx.body = result;
  await next();
  console.log("请求完成\n");
});

/**
 * 爬取网站首页生成html,目的是做seo
 * @param {string} target:爬取的平台 xd：新抖 xs：新视 xz：新站 xk:新快
 */
router.post("/spiderIndex", async (ctx, next) => {
  ctx.type = "json";
  let result = {};
  let page;
  let browSer;
  // 过滤script标签的正则
  const scriptFilterReg = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
  // 匹配link标签的href=//
  const hrefReplaceReg = /href="\/\//g;

  const { target } = ctx.request.body;

  // 未传入平台代码
  if (!target) {
    result = { code: 4000, msg: "请传入想要爬取的平台代码" };
    ctx.body = result;
    return;
  }
  // 传入的平台代码与Map不匹配
  if (!targetPlatformMap.get(target)) {
    result = { code: 4000, msg: "传入的爬取平台代码不匹配" };
    ctx.body = result;
    return;
  }
  try {
    // 创建浏览器websocket链接
    const browserWsInstance = await BrowserWs.getInstance();

    // 重新通过websocket链接浏览器
    browSer = await puppeteer.connect({
      browserWSEndpoint: browserWsInstance,
    });
    // 生成页面
    page = await browSer.newPage();
    await page.goto(targetPlatformMap.get(target), {
      waitUntil: "networkidle0",
    });
    const htmlContent = await page.content();
    // 过滤掉html的script标签，对link标签的href指向地址进行重写
    const filterHtml = htmlContent
      .replace(hrefReplaceReg, 'href="https://')
      .replace(scriptFilterReg, "");

    // 爬取到的内容写成html文件
    fs.writeFileSync(
      path.join(__dirname, `/html/${platformFilenameMap.get(target)}`),
      filterHtml
    );
    result = {
      code: 2000,
      msg: "爬取首页完成",
      indexUrl: ctx.origin + `/html/${platformFilenameMap.get(target)}`,
    };
    ctx.body = result;
  } catch (error) {
    console.log("爬取首页接口错误：", error);
    ctx.body = { code: 4000, msg: "接口错误" };
  }
  if (page) {
    page.close();
  }
});

app.on("error", (error, ctx) => {
  console.log("非接口错误", error);
});

app.use(router.routes());
app.listen(7878);
