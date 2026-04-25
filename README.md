# dashboard_o

红圈项目看板系统。

## 内容

- `website/`：Node.js + HTML5 看板服务
- 登录页、主看板、迭代详情、日报复盘
- 本地 JSON 数据、会话认证、IAM 校验接口

## 启动

```bash
cd website
node server.js
```

默认访问：`http://127.0.0.1:3100`

## 注意

- 本仓库不包含本地密钥配置文件
- 如需启用本地华为云认证，请自行创建 `website/config/project-config.local.json`
