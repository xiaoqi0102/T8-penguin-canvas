# 文生图

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /v1/images/generations:
    post:
      summary: 文生图
      deprecated: false
      description: |-
        ## 常用 size ：
        - `1024x1024` (square)
        - `1536x1024` (landscape)
        - `1024x1536` (portrait)
        - `2048x2048` (2K square)
        - `2048x1152` (2K landscape)
        - `3840x2160` (4K landscape)
        - `2160x3840` (4K portrait)
        - `auto` (default)

        ## 也支持自定义 size：
        最大边长必须小于或等于 3840px
        两条边都必须是以下数字的倍数 16px
        长边与短边之比不得超过 3:1
        总像素数必须至少为 655,360，且不得超过 8,294,400

        ## quality 支持

        - `low`
        - `medium`
        - `high`
        - `auto` (default)

        ## prompt 长度限制

        **32000 characters** ≈
        - 英文：~5K–8K words
        - 中文：~2万字左右
      tags:
        - AI模型接口/图像生成/openai/gpt-image-2
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                model:
                  type: string
                prompt:
                  type: string
                quality:
                  type: string
                size:
                  type: string
                  description: |-
                    常用 size ：
                    1024x1024 (square)
                    1536x1024 (landscape)
                    1024x1536 (portrait)
                    2048x2048 (2K square)
                    2048x1152 (2K landscape)
                    3840x2160 (4K landscape)
                    2160x3840 (4K portrait)
                    auto (default)
                  examples:
                    - 1024x1024 (square)
                    - 1536x1024 (landscape)
                    - 1024x1536 (portrait)
                    - 2048x2048 (2K square)
                    - 2048x1152 (2K landscape)
                    - 3840x2160 (4K landscape)
                    - 2160x3840 (4K portrait)
                    - auto (default)
              required:
                - model
                - prompt
                - quality
                - size
              x-apifox-orders:
                - model
                - prompt
                - quality
                - size
              x-apifox-ignore-properties: []
            example:
              model: openai/gpt-image-2
              prompt: 可爱的少女，动漫
              quality: high
      responses:
        '200':
          description: ''
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ImageGenerationResponse'
          headers: {}
          x-apifox-name: 成功
      security:
        - qnaigc: []
          x-apifox:
            required: true
            schemeGroups:
              - id: JLqZ7jxdZ-Rh5fBlVHA1x
                schemeIds:
                  - qnaigc
            use:
              id: JLqZ7jxdZ-Rh5fBlVHA1x
      x-apifox-folder: AI模型接口/图像生成/openai/gpt-image-2
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/7567950/apis/api-448014490-run
components:
  schemas:
    ImageGenerationResponse:
      $id: https://example.com/schemas/image-generation-response.json
      title: ImageGenerationResponse
      type: object
      additionalProperties: false
      required:
        - created
        - data
      properties:
        created:
          type: integer
          description: Unix 时间戳（秒）
        data:
          type: array
          minItems: 1
          items:
            type: object
            additionalProperties: false
            required:
              - b64_json
            properties:
              b64_json:
                type: string
                description: 图片的 base64 数据（当前实现固定返回该字段）
            x-apifox-orders:
              - b64_json
            x-apifox-ignore-properties: []
        background:
          type: string
          description: 可选，背景类型
        output_format:
          type: string
          description: 可选，输出格式；当前实现默认会给 png
          enum:
            - png
            - jpeg
            - webp
        size:
          type: string
          description: 可选，图像尺寸
        quality:
          type: string
          description: 可选，图像质量
        usage:
          type: object
          additionalProperties: false
          properties:
            total_tokens:
              type: integer
            input_tokens:
              type: integer
            output_tokens:
              type: integer
            ti_quantity:
              type: integer
            ii_quantity:
              type: integer
            mi2i_quantity:
              type: integer
            req_count:
              type: integer
            input_tokens_details:
              type: object
              additionalProperties: false
              properties:
                text_tokens:
                  type: integer
                image_tokens:
                  type: integer
              x-apifox-orders:
                - text_tokens
                - image_tokens
              x-apifox-ignore-properties: []
            output_tokens_details:
              type: object
              additionalProperties: false
              properties:
                image_tokens:
                  type: integer
                reasoning_tokens:
                  type: integer
                text_tokens:
                  type: integer
              x-apifox-orders:
                - image_tokens
                - reasoning_tokens
                - text_tokens
              x-apifox-ignore-properties: []
          x-apifox-orders:
            - total_tokens
            - input_tokens
            - output_tokens
            - ti_quantity
            - ii_quantity
            - mi2i_quantity
            - req_count
            - input_tokens_details
            - output_tokens_details
          x-apifox-ignore-properties: []
      x-apifox-orders:
        - created
        - data
        - background
        - output_format
        - size
        - quality
        - usage
      x-apifox-ignore-properties: []
      x-apifox-folder: ''
  securitySchemes:
    qnaigc:
      type: bearer
      scheme: bearer
      description: '使用 Bearer Token 进行认证，请在请求头中添加：Authorization: Bearer <access_token>'
    ApiKeyAuth:
      type: bearer
      scheme: bearer
      description: |
        使用 APIKey 进行认证。格式：`Bearer <APIKey>`

        示例：`Authorization: Bearer sk-xxxxxx`
    QiniuAuth:
      type: apikey
      in: header
      name: Authorization
      description: |
        使用七牛云标准的 AK/SK 签名认证。格式：`Qiniu <AccessKey>:<EncodedSign>`

        签名生成算法请参考七牛云官方文档。
    BearerAuth:
      type: bearer
      scheme: bearer
      description: 在 `Authorization` 请求头中传入 API Key，格式：`Bearer {api_key}`
servers:
  - url: https://openai.qiniu.com
    description: 国内端点
  - url: https://openai.sufy.com
    description: 海外端点
security:
  - qnaigc: []
    x-apifox:
      required: true
      schemeGroups:
        - id: JLqZ7jxdZ-Rh5fBlVHA1x
          schemeIds:
            - qnaigc
      use:
        id: JLqZ7jxdZ-Rh5fBlVHA1x

```
