import express from "express";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { UAParser } from 'ua-parser-js';

// تفعيل وضع التخفّي
puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 3000;

// إضافة متغيرات التليجرام - قيم مباشرة
const TELEGRAM_BOT_TOKEN = "8357160519:AAFwcfZhF9GgJaoysv2Dgx7fhaAcVfQqFGo";
const TELEGRAM_CHAT_ID = "7232694063";

app.use(express.json());
app.use(express.static("public"));

// تخزين للزيارات السابقة (مدى الحياة)
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
    baseUrl: "https://shr2link.com/",
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

// دالة تحسين معلومات OS و Browser باستخدام ua-parser-js
function getEnhancedSystemInfo(userAgent) {
  const parser = new UAParser(userAgent);
  const result = parser.getResult();
  
  let osInfo = 'Unknown OS';
  if (result.os.name) {
    osInfo = result.os.name;
    if (result.os.version) {
      osInfo += ` ${result.os.version}`;
    }
    
    osInfo = osInfo
      .replace('Mac OS', 'macOS')
      .replace('Windows', 'Windows')
      .replace('iOS', 'iOS')
      .replace('Android', 'Android')
      .replace('Linux', 'Linux')
      .replace('Chrome OS', 'ChromeOS');
  }
  
  let browserInfo = 'Unknown Browser';
  if (result.browser.name) {
    browserInfo = result.browser.name;
    if (result.browser.version) {
      const versionParts = result.browser.version.split('.').slice(0, 2);
      browserInfo += ` ${versionParts.join('.')}`;
    }
    
    browserInfo = browserInfo
      .replace('Chrome', 'Chrome')
      .replace('Firefox', 'Firefox')
      .replace('Safari', 'Safari')
      .replace('Edge', 'Edge')
      .replace('Opera', 'Opera')
      .replace('Samsung Browser', 'Samsung Internet')
      .replace('UCBrowser', 'UC Browser');
  }
  
  return {
    os: osInfo,
    browser: browserInfo
  };
}

// دالة إرسال إشعار التليجرام
async function sendTelegramNotification(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn("⚠️ Telegram credentials missing - notification skipped");
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
    console.error("Telegram notification error:", error);
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

// دالة الحصول على الموقع الجغرافي من IP
async function getGeoLocation(ip) {
  if (ip === '127.0.0.1' || ip === 'localhost' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
    return {
      country: 'Local',
      region: 'Local Network',
      city: 'Local',
      isp: 'Local',
      timezone: 'Local'
    };
  }

  try {
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query`);
    const data = await response.json();
    
    if (data.status === 'success') {
      return {
        country: data.country || 'Unknown',
        region: data.regionName || 'Unknown',
        city: data.city || 'Unknown',
        isp: data.isp || 'Unknown',
        timezone: data.timezone || 'Unknown',
        coordinates: data.lat && data.lon ? `${data.lat}, ${data.lon}` : 'Unknown'
      };
    }
  } catch (error) {
    // لا نطبع أي شيء في حالة الخطأ
  }

  return {
    country: 'Unknown',
    region: 'Unknown',
    city: 'Unknown',
    isp: 'Unknown',
    timezone: 'Unknown'
  };
}

// دالة استخراج معلومات الزائر مع الموقع الجغرافي
async function getVisitorInfo(req) {
  try {
    const ip = req.headers['x-forwarded-for'] || 
               req.headers['x-real-ip'] || 
               req.connection.remoteAddress || 
               req.socket.remoteAddress ||
               'Unknown IP';

    const cleanIp = ip.toString().replace(/::ffff:/, '').replace(/^::1$/, '127.0.0.1').split(',')[0].trim();

    const userAgent = req.headers['user-agent'] || 'Unknown User Agent';
    
    const systemInfo = getEnhancedSystemInfo(userAgent);
    const geoInfo = await getGeoLocation(cleanIp);
    
    return {
      ip: cleanIp,
      userAgent,
      os: systemInfo.os,
      browser: systemInfo.browser,
      country: geoInfo.country,
      region: geoInfo.region,
      city: geoInfo.city,
      isp: geoInfo.isp,
      timezone: geoInfo.timezone,
      timestamp: new Date().toLocaleString(),
      isNew: isNewVisitor(cleanIp, userAgent)
    };
  } catch (error) {
    return {
      ip: 'Unknown',
      userAgent: 'Unknown',
      os: 'Unknown OS',
      browser: 'Unknown Browser',
      country: 'Unknown',
      region: 'Unknown',
      city: 'Unknown',
      isp: 'Unknown',
      timezone: 'Unknown',
      timestamp: new Date().toLocaleString(),
      isNew: true
    };
  }
}

// نقطة النهاية لتتبع الزيارات
app.post("/api/visit", async (req, res) => {
  try {
    const visitorInfo = await getVisitorInfo(req);
    
    // إرسال إشعار فقط للزوار الجدد
    if (visitorInfo.isNew) {
      const message = `
🆕 <b>New Visitor</b>

📍 <b>IP:</b> <code>${visitorInfo.ip}</code>
🏴 <b>Country:</b> ${visitorInfo.country}
🏙️ <b>Region:</b> ${visitorInfo.region}
🏢 <b>City:</b> ${visitorInfo.city}
🌐 <b>ISP:</b> ${visitorInfo.isp}
🕒 <b>Timezone:</b> ${visitorInfo.timezone}

🖥️ <b>OS:</b> ${visitorInfo.os}
🌐 <b>Browser:</b> ${visitorInfo.browser}
🕒 <b>Time:</b> ${visitorInfo.timestamp}

📊 <b>User Agent:</b>
<code>${visitorInfo.userAgent}</code>
      `.trim();

      await sendTelegramNotification(message);
    }

    res.json({ success: true, message: "Visit logged", isNew: visitorInfo.isNew });
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
    const result = await extractDownloadLink(fullUrl, info.referer, site);

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
    console.error("Bypass error:", error);
    return res.status(500).json({ 
      success: false, 
      error: "Service temporarily unavailable" 
    });
  }
});

// دالة استخراج رابط التحميل - معدلة للعمل على Replit
async function extractDownloadLink(fullUrl, referer, site) {
  let browser;
  try {
    // إعدادات متوافقة مع Replit
    browser = await puppeteer.launch({
      headless: "new",
      executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser',
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--single-process",
        "--disable-gpu",
        "--disable-web-security"
      ],
    });

    const page = await browser.newPage();
    
    // زيادة الوقتouts لمنع الأخطاء
    await page.setDefaultNavigationTimeout(60000);
    await page.setDefaultTimeout(30000);

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    );

    await page.setExtraHTTPHeaders({ Referer: referer });

    // إزالة webdriver و fingerprints
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      window.chrome = { runtime: {} };
    });

    console.log(`🔗 Navigating to: ${fullUrl}`);
    await page.goto(fullUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    // انتظر حتى تحميل الصفحة
    await page.waitForTimeout(8000);

    let downloadUrl = await page.evaluate(() => {
      const elements = document.querySelectorAll("button, a, div, span");

      for (let element of elements) {
        const text = element.textContent?.trim().toLowerCase();
        if (!text) continue;

        if (
          text.includes("get link") ||
          text.includes("getlink") ||
          text.includes("download")
        ) {
          if (element.href && element.href.includes("http")) return element.href;

          const onclick = element.getAttribute("onclick");
          if (onclick) {
            const url =
              onclick.match(/window\.open\('([^']+)'\)/)?.[1] ||
              onclick.match(/location\.href=['"]([^'"]+)['"]/)?.[1];

            if (url) return url;
          }
        }
      }
      return null;
    });

    // المحاولة الثانية إذا لم يجد الرابط
    if (!downloadUrl) {
      await page.waitForTimeout(6000);

      downloadUrl = await page.evaluate(() => {
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
            if (element.href && element.href.includes("http")) return element.href;

            const onclick = element.getAttribute("onclick");
            if (onclick) {
              const url =
                onclick.match(/window\.open\('([^']+)'\)/)?.[1] ||
                onclick.match(/location\.href=['"]([^'"]+)['"]/)?.[1] ||
                onclick.match(/window\.location=['"]([^'"]+)['"]/)?.[1];

              if (url) return url;
            }

            const dataHref = element.getAttribute('data-href') || 
                           element.getAttribute('data-url') ||
                           element.getAttribute('data-link');
            if (dataHref) return dataHref;
          }
        }
        return null;
      });
    }

    console.log(`✅ Found URL: ${downloadUrl}`);
    return downloadUrl;
  } catch (err) {
    console.error("❌ Puppeteer error:", err.message);
    return null;
  } finally {
    if (browser) await browser.close();
  }
}

app.get("/", (req, res) => {
  res.sendFile("index.html", { root: "public" });
});

app.get("/health", (req, res) => {
  res.json({ status: "OK", message: "Server is running" });
});

app.listen(PORT, () => console.log(`🚀 Server started on port ${PORT}`));
