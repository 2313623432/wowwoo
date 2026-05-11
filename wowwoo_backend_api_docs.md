# WowWoo Backend API 接口文档

## 基础信息

- **Base URL:** `http://localhost:8000`
- **API 版本:** `/api/v1`
- **认证方式:** JWT Bearer Token
- **数据格式:** JSON
- **编码:** UTF-8

### 认证说明

需要在请求头中携带 JWT Token：
```http
Authorization: Bearer <your-access-token>
```

### 错误码说明

| HTTP 状态码 | 说明 |
|------------|------|
| 200 | 成功 |
| 400 | 请求参数错误 |
| 403 | 认证失败 / Token 无效 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |

---

## 认证模块 (Auth)

### 1. 发送验证码

发送手机验证码到指定手机号。

**端点：**
```
POST /api/v1/auth/send-code
```

**请求参数：**
```json
{
    "phone": "13800138000",
    "purpose": "login"
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| phone | string | 是 | 手机号 |
| purpose | string | 是 | 用途：`login` 或 `register` |

**成功响应：**
```json
{
    "msg": "Verification code sent"
}
```

**错误响应：**
```json
{
    "detail": "Invalid purpose"
}
```

**调用示例：**
```bash
curl -X POST http://localhost:8000/api/v1/auth/send-code \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "13800138000",
    "purpose": "login"
  }'
```

---

### 2. 验证码登录/注册

使用手机号和验证码登录，如果用户不存在则自动注册并登录。

**端点：**
```
POST /api/v1/auth/login
```

**请求参数：**
```json
{
    "phone": "13800138000",
    "code": "123456"
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| phone | string | 是 | 手机号 |
| code | string | 是 | 6 位验证码 |

**成功响应：**
```json
{
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "token_type": "bearer"
}
```

**错误响应：**
```json
{
    "detail": "Invalid or expired verification code"
}
```

**调用示例：**
```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "13800138000",
    "code": "123456"
  }'
```

---

### 3. 密码注册

使用手机号、密码和验证码注册新用户。

**端点：**
```
POST /api/v1/auth/register
```

**请求参数：**
```json
{
    "phone": "13800138000",
    "password": "password123",
    "nickname": "张三",
    "avatar": "https://example.com/avatar.png",
    "code": "123456"
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| phone | string | 是 | 手机号 |
| password | string | 是 | 密码（最多 72 字节） |
| nickname | string | 否 | 昵称 |
| avatar | string | 否 | 头像 URL |
| code | string | 是 | 6 位验证码 |

**成功响应：**
```json
{
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "token_type": "bearer"
}
```

**错误响应：**
```json
{
    "detail": "The user with this phone already exists in the system"
}
```

**调用示例：**
```bash
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "13800138000",
    "password": "password123",
    "nickname": "张三",
    "code": "123456"
  }'
```

---

### 4. 上传头像注册

使用手机号、密码、验证码和头像文件注册新用户。

**端点：**
```
POST /api/v1/auth/register-with-avatar
```

**请求参数 (multipart/form-data)：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| phone | string | 是 | 手机号 |
| password | string | 是 | 密码 |
| code | string | 是 | 6 位验证码 |
| nickname | string | 否 | 昵称 |
| avatar | file | 否 | 头像图片文件 |

**成功响应：**
```json
{
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "token_type": "bearer"
}
```

**调用示例：**
```bash
curl -X POST http://localhost:8000/api/v1/auth/register-with-avatar \
  -F "phone=13800138000" \
  -F "password=password123" \
  -F "code=123456" \
  -F "nickname=张三" \
  -F "avatar=@/path/to/avatar.jpg"
```

---

### 5. 密码登录

使用手机号和密码登录（OAuth2 兼容接口）。

**端点：**
```
POST /api/v1/auth/login/access-token
```

**请求参数 (application/x-www-form-urlencoded)：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| username | string | 是 | 手机号（作为用户名） |
| password | string | 是 | 密码 |

**成功响应：**
```json
{
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "token_type": "bearer"
}
```

**错误响应：**
```json
{
    "detail": "Incorrect phone or password"
}
```

**调用示例：**
```bash
curl -X POST http://localhost:8000/api/v1/auth/login/access-token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=13800138000&password=password123"
```

---

## 用户模块 (Users)

### 1. 获取当前用户信息

获取当前登录用户的详细信息。

**端点：**
```
GET /api/v1/users/me
```

**请求头：**
```http
Authorization: Bearer <your-access-token>
```

**成功响应：**
```json
{
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "phone": "13800138000",
    "nickname": "张三",
    "avatar": "/static/avatars/13800138000_1677782400_avatar.jpg",
    "is_active": true,
    "is_ai": false,
    "preferences": {
        "theme": "dark",
        "language": "zh-CN"
    }
}
```

**错误响应：**
```json
{
    "detail": "Could not validate credentials"
}
```

**调用示例：**
```bash
curl -X GET http://localhost:8000/api/v1/users/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

### 2. 更新当前用户信息

更新当前登录用户的昵称、头像或偏好设置。

**端点：**
```
PUT /api/v1/users/me
```

**请求头：**
```http
Authorization: Bearer <your-access-token>
```

**请求参数：**
```json
{
    "nickname": "李四",
    "avatar": "https://example.com/new-avatar.png",
    "preferences": {
        "theme": "light",
        "language": "en-US"
    }
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| nickname | string | 否 | 新昵称 |
| avatar | string | 否 | 新头像 URL |
| preferences | object | 否 | 偏好设置（JSON） |

**成功响应：**
```json
{
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "phone": "13800138000",
    "nickname": "李四",
    "avatar": "https://example.com/new-avatar.png",
    "is_active": true,
    "is_ai": false,
    "preferences": {
        "theme": "light",
        "language": "en-US"
    }
}
```

**调用示例：**
```bash
curl -X PUT http://localhost:8000/api/v1/users/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "nickname": "李四",
    "preferences": {
      "theme": "light"
    }
  }'
```

---

## 聊天会话模块 (User Chat Sessions)

### 1. 创建聊天会话

将外部聊天会话绑定到当前用户。

**端点：**
```
POST /api/v1/user-chat-sessions/
```

**请求头：**
```http
Authorization: Bearer <your-access-token>
```

**请求参数：**
```json
{
    "session_id": "temporal_workflow_123456",
    "title": "与温柔学姐的对话"
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| session_id | string | 是 | 外部系统的会话 ID（如 Temporal Workflow ID） |
| title | string | 否 | 会话标题 |

**成功响应：**
```json
{
    "id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "session_id": "temporal_workflow_123456",
    "title": "与温柔学姐的对话",
    "status": "active",
    "created_at": "2026-03-03T10:00:00Z",
    "updated_at": "2026-03-03T10:00:00Z"
}
```

**调用示例：**
```bash
curl -X POST http://localhost:8000/api/v1/user-chat-sessions/ \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "temporal_workflow_123456",
    "title": "与温柔学姐的对话"
  }'
```

---

### 2. 获取用户的所有聊天会话

获取当前用户的所有聊天会话列表（按更新时间倒序）。

**端点：**
```
GET /api/v1/user-chat-sessions/
```

**请求头：**
```http
Authorization: Bearer <your-access-token>
```

**查询参数：**
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| skip | int | 否 | 0 | 跳过条数 |
| limit | int | 否 | 100 | 返回条数 |

**成功响应：**
```json
[
    {
        "id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
        "user_id": "550e8400-e29b-41d4-a716-446655440000",
        "session_id": "temporal_workflow_123456",
        "title": "与温柔学姐的对话",
        "status": "active",
        "created_at": "2026-03-03T10:00:00Z",
        "updated_at": "2026-03-03T18:00:00Z"
    },
    {
        "id": "7d544860-9dad-11d1-80b4-00c04fd430c8",
        "user_id": "550e8400-e29b-41d4-a716-446655440000",
        "session_id": "temporal_workflow_789012",
        "title": "与体育生的对话",
        "status": "active",
        "created_at": "2026-03-02T15:00:00Z",
        "updated_at": "2026-03-02T20:00:00Z"
    }
]
```

**调用示例：**
```bash
curl -X GET "http://localhost:8000/api/v1/user-chat-sessions/?skip=0&limit=20" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

### 3. 删除聊天会话

解除当前用户与聊天会话的绑定。

**端点：**
```
DELETE /api/v1/user-chat-sessions/{session_id}
```

**请求头：**
```http
Authorization: Bearer <your-access-token>
```

**路径参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| session_id | string | 是 | 会话 ID（外部 session_id，不是数据库 id） |

**成功响应：**
```json
{
    "id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "session_id": "temporal_workflow_123456",
    "title": "与温柔学姐的对话",
    "status": "active",
    "created_at": "2026-03-03T10:00:00Z",
    "updated_at": "2026-03-03T18:00:00Z"
}
```

**错误响应：**
```json
{
    "detail": "Chat session not found"
}
```

**调用示例：**
```bash
curl -X DELETE http://localhost:8000/api/v1/user-chat-sessions/temporal_workflow_123456 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## 表情模块 (Emojis)

### 1. 获取所有表情

获取系统中的所有表情列表。

**端点：**
```
GET /api/v1/emojis/
```

**请求头：**
```http
Authorization: Bearer <your-access-token>
```

**查询参数：**
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| skip | int | 否 | 0 | 跳过条数 |
| limit | int | 否 | 100 | 返回条数 |

**成功响应：**
```json
[
    {
        "id": 1,
        "name": "smile",
        "emoji": "😊",
        "category": "emotion"
    },
    {
        "id": 2,
        "name": "cry",
        "emoji": "😭",
        "category": "emotion"
    },
    {
        "id": 3,
        "name": "heart",
        "emoji": "❤️",
        "category": "symbol"
    }
]
```

**调用示例：**
```bash
curl -X GET "http://localhost:8000/api/v1/emojis/?skip=0&limit=50" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## 健康检查

### 服务状态

检查后端服务运行状态。

**端点：**
```
GET /
```

**成功响应：**
```json
{
    "message": "Welcome to WowWoo Backend"
}
```

**调用示例：**
```bash
curl http://localhost:8000/
```

---

## API 文档

启动服务后，访问 Swagger 文档：

```
http://localhost:8000/docs
```

访问 ReDoc 文档：

```
http://localhost:8000/redoc
```

---

## 完整调用示例

### 完整登录流程

```bash
# 1. 发送验证码
curl -X POST http://localhost:8000/api/v1/auth/send-code \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "13800138000",
    "purpose": "login"
  }'

# 响应: {"msg": "Verification code sent"}

# 2. 验证码登录（自动注册）
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "13800138000",
    "code": "123456"
  }'

# 响应: {"access_token": "...", "token_type": "bearer"}

# 3. 获取用户信息
curl -X GET http://localhost:8000/api/v1/users/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# 4. 创建聊天会话
curl -X POST http://localhost:8000/api/v1/user-chat-sessions/ \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "temporal_workflow_123456",
    "title": "与温柔学姐的对话"
  }'

# 5. 获取会话列表
curl -X GET http://localhost:8000/api/v1/user-chat-sessions/ \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## 注意事项

1. **验证码有效期**：5 分钟
2. **Token 有效期**：7 天（10080 分钟）
3. **验证码只能使用一次**：使用后会自动删除
4. **密码限制**：最多 72 字节
5. **头像上传**：支持 `multipart/form-data` 格式

---

## 环境变量配置

```env
# 数据库
DATABASE_URL=postgresql+asyncpg://user:password@localhost/wowwoo_db

# Redis
REDIS_URL=redis://localhost:6379/0

# 安全
SECRET_KEY=your-secret-key
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=10080

# ARPA
ARPA_API_URL=http://localhost:8081
ARPA_API_KEY=your-arpa-api-key

# SMS
SMS_CODE_EXPIRE_MINUTES=5

# CORS
BACKEND_CORS_ORIGINS=["http://localhost:3000"]
```
