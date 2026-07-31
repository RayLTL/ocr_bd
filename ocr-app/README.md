# Baidu OCR Workbench

本地 OCR 应用，调用百度 AI OCR 服务，支持 60+ 接口，识别结果可导出 TXT / Excel。

## 部署到 Cloudflare Pages

### 1. 推送代码到 GitHub

```bash
git push -u origin main
```

### 2. 在 Cloudflare Pages 创建项目

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 **Workers & Pages** → **创建** → **Pages** → **连接到 Git**
3. 选择 `ocr_bd` 仓库
4. 构建设置保持默认（无需构建命令，输出目录留空）
5. 点击 **保存并部署**

### 3. 配置环境变量

部署后，在 Pages 项目设置中：

1. 进入 **设置** → **环境变量**
2. 添加以下变量：

| 变量名 | 值 |
|--------|-----|
| `BAIDU_OCR_API_KEY` | 你的百度 OCR API Key |
| `BAIDU_OCR_SECRET_KEY` | 你的百度 OCR Secret Key |

3. 进入 **Functions** → **兼容性标志**，添加 `nodejs_compat`

### 4. 重新部署

设置环境变量后，重新部署以使配置生效。

## 本地开发

```bash
npx wrangler pages dev . --binding -- npm run test
```

## 项目结构

```
├── public/              # 前端静态文件
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── functions/           # Pages Functions (API)
│   └── api/
│       ├── ocr.js       # POST /api/ocr
│       ├── services.js  # GET /api/services
│       └── health.js    # GET /api/health
├── lib/                 # 共享库
│   ├── baidu.js         # 百度 OCR 调用逻辑
│   └── services.js      # OCR 服务目录
├── test/                # 测试
│   └── baidu.test.js
└── package.json
```

## 测试

```bash
npm test
```