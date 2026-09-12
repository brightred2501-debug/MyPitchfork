# MyPitchfork GitHub Pages 部署

## 部署结构

部署产物只有 `index.html` 和 `src/`，不包含 Node 服务、测试、文档或本地生成的海报。

- 专辑与曲目：浏览器直接请求 Apple iTunes Search API。
- Apple 封面：浏览器直接请求 `https://*.mzstatic.com`。
- 自定义封面：用户从本机选择，页面裁成 1200 × 1200 JPEG 后保存到该浏览器的 `localStorage`。
- 用户数据：没有账号和数据库，不会上传草稿、评分或自定义封面。

页面的 Content Security Policy 会阻止脚本连接 Apple 以外的远程接口，并阻止加载非 Apple 的远程图片。

## 首次发布

1. 在 GitHub 创建一个空仓库，例如 `MyPitchfork`。
2. 在项目目录执行：

   ```powershell
   git init
   git branch -M main
   git add .
   git commit -m "Create GitHub Pages version"
   git remote add origin https://github.com/你的用户名/MyPitchfork.git
   git push -u origin main
   ```

3. 打开 GitHub 仓库的 `Settings` → `Pages`。
4. 在 `Build and deployment` 的 `Source` 中选择 `GitHub Actions`。
5. 打开 `Actions`，等待 `Deploy MyPitchfork to GitHub Pages` 完成。

发布地址通常是：

```text
https://brightred2501-debug.github.io/MyPitchfork/
```

以后推送到 `main` 分支会自动重新部署，也可以在 Actions 页面手动运行工作流。

## 本地验证

```powershell
npm start
```

访问 `http://127.0.0.1:5174/`。如已安装 Chrome 或 Edge，可执行：

```powershell
npm test
```

## 已知限制

- Apple 接口或封面 CDN 暂时不可用时，搜索或封面加载会失败。
- Apple 封面必须继续允许跨域读取，才能被绘制到下载的 Canvas PNG。
- 自定义封面和草稿只在当前浏览器中存在；清除站点数据或换设备后不会同步。
- 浏览器的本地存储空间有限，因此上传图片会先缩放和压缩。
