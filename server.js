import express from "express";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { UAParser } from 'ua-parser-js';
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// تفعيل وضع التخفّي
puppeteer.use(StealthPlugin());

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// إضافة متغيرات التليجرام - استخدم Environment Variables في Replit
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

app.use(express.json());
app.use(express.static(join(__dirname, "public")));

// تخزين للزيارات السابقة
const visitorCache = new Map();

const sites = {
  yorurl: {
    baseUrl: "https://go.yorurl.com/",
    referer: "https://how2guidess.com/",
  },
  linkjust: {
    baseUrl: "https://linkjust.com/",
    referer: "https://yjiur.xyz/",
  },
  shr2link: {
    baseUrl: "https://shr2.link/",
    referer: "https://bigcarinsurance.com/",
  },
  just2earn: {
    baseUrl: "https://go.just2earn.com/",
    referer: "https://mahitiportal.in/",
  },
  "nitro-link": {
    baseUrl: "https://nitro-link.com/",
    referer: "https://finestart.online/",
  },
};

// دالة تحسين معلومات OS و Browser
function getEnhancedSystemInfo(userAgent) {
  const parser = new UAParser(userAgent);
  const result = parser.getResult();
  
  let osInfo = 'Unknown OS';
  if (result.os.name) {
    osInfo = result.os.name;
    if (result.os.version) {
      osInfo += ` ${result.os.version}`;
    }
  }
  
  let browserInfo = 'Unknown Browser';
  if (result.browser.name) {
    browserInfo = result.browser.name;
    if (result.browser.version) {
      const versionParts = result.browser.version.split('.').slice(0, 2);
      browserInfo += ` ${versionParts.join('.')}`;
    }
  }
  
  return { os: osInfo, browser: browserInfo };
}

// دالة إرسال إشعار التليجرام
async function sendTelegramNotification(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return false;
  }

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "HTML"
      })
    });

    const result = await response.json();
    return result.ok;
  } catch (error) {
    return false;
  }
}

// دالة التحقق من الزائر الجديد
function isNewVisitor(ip, userAgent) {
  const visitorKey = `${ip}-${userAgent}`;
  
  if (visitorCache.has(visitorKey)) {
    return false;
  }
  
  visitorCache.set(visitorKey, Date.now());
  return true;
}

// نقطة النهاية لتتبع الزيارات
app.post("/api/visit", async (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for'] || req.ip || 'Unknown IP';
    const userAgent = req.headers['user-agent'] || 'Unknown User Agent';
    
    const visitorKey = `${ip}-${userAgent}`;
    const isNew = isNewVisitor(ip, userAgent);

    // إرسال إشعار فقط للزوار الجدد
    if (isNew) {
      const systemInfo = getEnhancedSystemInfo(userAgent);
      
      const message = `
🆕 <b>New Visitor</b>

📍 <b>IP:</b> <code>${ip}</code>
🖥️ <b>OS:</b> ${systemInfo.os}
🌐 <b>Browser:</b> ${systemInfo.browser}
🕒 <b>Time:</b> ${new Date().toLocaleString()}

📊 <b>User Agent:</b>
<code>${userAgent}</code>
      `.trim();

      await sendTelegramNotification(message);
    }

    res.json({ success: true, message: "Visit logged", isNew });
  } catch (error) {
    res.status(500).json({ success: false, error: "Tracking failed" });
  }
});

// نقطة النهاية لعمليات الـ Bypass
app.post("/api/bypass", async (req, res) => {
  const { site, urlPath } = req.body;

  if (!site || !urlPath)
    return res.status(400).json({ success: false, error: "Required parameters are missing" });

  const info = sites[site];
  if (!info)
    return res.status(400).json({ success: false, error: "This website is not currently supported" });

  const cleanPath = urlPath.replace(/^https?:\/\/[^\/]+\//, "").replace(/^\//, "");
  const fullUrl = info.baseUrl + cleanPath;

  try {
    const result = await extractDownloadLink(fullUrl, info.referer);

    if (result) {
      return res.json({ 
        success: true, 
        downloadUrl: result, 
        originalUrl: fullUrl,
        message: "Link bypassed successfully!"
      });
    }

    return res.status(404).json({ 
      success: false, 
      error: "Download link not found - please try again" 
    });

  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      error: "Service temporarily unavailable" 
    });
  }
});

// دالة استخراج رابط التحميل
async function extractDownloadLink(fullUrl, referer) {
  let browser;
  try {
    // إعدادات Puppeteer لـ Replit
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu"
      ],
    });

    const page = await browser.newPage();

    // User Agent عشوائي
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    await page.setExtraHTTPHeaders({ Referer: referer });

    // إزالة webdriver
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });

    await page.goto(fullUrl, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    await new Promise((res) => setTimeout(res, 5000));

    // البحث عن رابط التحميل
    let downloadUrl = await page.evaluate(() => {
      // البحث في جميع العناصر
      const elements = document.querySelectorAll("button, a, div, span");
      
      for (let element of elements) {
        const text = element.textContent?.trim().toLowerCase();
        if (!text) continue;

        if (
          text.includes("get link") ||
          text.includes("getlink") ||
          text.includes("download") ||
          text.includes("continue") ||
          text.includes("proceed")
        ) {
          // محاولة الحصول على الرابط من href
          if (element.href && element.href.includes("http")) {
            return element.href;
          }

          // محاولة الحصول على الرابط من onclick
          const onclick = element.getAttribute("onclick");
          if (onclick) {
            const urlMatch = onclick.match(/window\.open\('([^']+)'\)/) ||
                           onclick.match(/location\.href=['"]([^'"]+)['"]/) ||
                           onclick.match(/window\.location=['"]([^'"]+)['"]/);
            if (urlMatch && urlMatch[1]) {
              return urlMatch[1];
            }
          }

          // البحث في data attributes
          const dataHref = element.getAttribute('data-href') || 
                         element.getAttribute('data-url') ||
                         element.getAttribute('data-link');
          if (dataHref) {
            return dataHref;
          }
        }
      }
      return null;
    });

    return downloadUrl;
  } catch (err) {
    console.error('Error extracting download link:', err);
    return null;
  } finally {
    if (browser) await browser.close();
  }
}

// نقطة النهاية للصحة
app.get("/health", (req, res) => {
  res.json({ 
    status: "OK", 
    timestamp: new Date().toISOString(),
    service: "URL Bypass API"
  });
});

app.get("/", (req, res) => {
  res.sendFile(join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`🚀 Server started on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});
