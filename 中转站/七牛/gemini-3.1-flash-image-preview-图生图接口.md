# 图生图接口 - 基于输入图像生成新图像

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /v1/images/edits:
    post:
      summary: 图生图接口 - 基于输入图像生成新图像
      deprecated: false
      description: 基于输入图像和文本描述生成新的图像，支持图像编辑、风格转换和内容修改。
      operationId: createImageEdit
      tags:
        - AI模型接口/图像生成/gemini-3.1-flash-image-preview
        - 图像生成/gemini-3.1-flash-image-preview
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/Gemini31FlashImageEditRequest'
            examples:
              basic:
                value:
                  model: gemini-3.1-flash-image-preview
                  image: >-
                    https://aitoken-public.qnaigc.com/example/generate-video/running-man.jpg
                  prompt: 为这个场景添加日落效果，让整体色调更温暖
                summary: 基础图生图
              multiple-images:
                value:
                  model: gemini-3.1-flash-image-preview
                  image:
                    - >-
                      https://aitoken-public.qnaigc.com/example/generate-video/running-man.jpg
                    - >-
                      https://aitoken-public.qnaigc.com/example/generate-video/lawn.jpg
                  prompt: 结合这两张图片的风格，生成一张新的艺术作品
                summary: 使用多张输入图像
              with-mask:
                value:
                  model: gemini-3.1-flash-image-preview
                  image:
                    - >-
                      https://aitoken-public.qnaigc.com/example/generate-image/image-to-image-with-mask-1.jpg
                    - >-
                      https://aitoken-public.qnaigc.com/example/generate-image/image-to-image-with-mask-2.png
                  prompt: >-
                    使用第二张图片作为遮罩图，仅在遮罩图中的白色区域允许生成内容。在第一张图片的对应位置添加两个人正在拥抱的场景。遮罩以白色区域为可生成区域，黑色区域保持第一张图片不变，不要修改遮罩外的背景、建筑或已有物体。不要把遮罩的白色保留到第一个图片。
                  image_config:
                    aspect_ratio: '16:9'
                    image_size: 1K
                summary: 使用遮罩进行精确编辑
              with-base64:
                value:
                  model: gemini-3.1-flash-image-preview
                  image: data:image/png;base64,iVBORw0KGgoAAAANSUhEUgA...
                  prompt: 将这张图片转换为油画风格
                summary: 使用Base64输入图像
      responses:
        '200':
          description: 请求成功
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ImageGenerationResponse'
              example:
                created: 1234567890
                data:
                  - b64_json: iVBORw0KGgoAAAANSUhEUgA...
                output_format: png
                usage:
                  total_tokens: 6234
                  input_tokens: 1234
                  output_tokens: 5000
                  input_tokens_details:
                    text_tokens: 234
                    image_tokens: 1000
          headers: {}
          x-apifox-name: ''
        '400':
          description: 错误响应
          content:
            application/json:
              schema:
                type: object
                description: 错误响应体
                properties:
                  error:
                    type: object
                    properties:
                      message:
                        type: string
                        description: 错误信息
                      type:
                        type: string
                        description: 错误类型
                      code:
                        type: string
                        description: 错误代码
                    x-apifox-orders:
                      - message
                      - type
                      - code
                    x-apifox-ignore-properties: []
                x-apifox-orders:
                  - error
                x-apifox-ignore-properties: []
              examples:
                '2':
                  summary: 请求参数错误
                  value:
                    error:
                      message: Invalid request parameters
                      type: invalid_request_error
                      code: invalid_parameters
                '3':
                  summary: 认证失败
                  value:
                    error:
                      message: Invalid API key provided
                      type: invalid_request_error
                      code: invalid_api_key
                '4':
                  summary: 服务器内部错误
                  value:
                    error:
                      message: Internal server error
                      type: server_error
                      code: internal_error
          headers: {}
          x-apifox-name: ''
        '401':
          description: 错误响应
          content:
            application/json:
              schema:
                type: object
                description: 错误响应体
                properties:
                  error:
                    type: object
                    properties:
                      message:
                        type: string
                        description: 错误信息
                      type:
                        type: string
                        description: 错误类型
                      code:
                        type: string
                        description: 错误代码
                    x-apifox-orders:
                      - message
                      - type
                      - code
                    x-apifox-ignore-properties: []
                x-apifox-orders:
                  - error
                x-apifox-ignore-properties: []
              examples:
                '5':
                  summary: 请求参数错误
                  value:
                    error:
                      message: Invalid request parameters
                      type: invalid_request_error
                      code: invalid_parameters
                '6':
                  summary: 认证失败
                  value:
                    error:
                      message: Invalid API key provided
                      type: invalid_request_error
                      code: invalid_api_key
                '7':
                  summary: 服务器内部错误
                  value:
                    error:
                      message: Internal server error
                      type: server_error
                      code: internal_error
          headers: {}
          x-apifox-name: ''
        '500':
          description: 错误响应
          content:
            application/json:
              schema:
                type: object
                description: 错误响应体
                properties:
                  error:
                    type: object
                    properties:
                      message:
                        type: string
                        description: 错误信息
                      type:
                        type: string
                        description: 错误类型
                      code:
                        type: string
                        description: 错误代码
                    x-apifox-orders:
                      - message
                      - type
                      - code
                    x-apifox-ignore-properties: []
                x-apifox-orders:
                  - error
                x-apifox-ignore-properties: []
              examples:
                '8':
                  summary: 请求参数错误
                  value:
                    error:
                      message: Invalid request parameters
                      type: invalid_request_error
                      code: invalid_parameters
                '9':
                  summary: 认证失败
                  value:
                    error:
                      message: Invalid API key provided
                      type: invalid_request_error
                      code: invalid_api_key
                '10':
                  summary: 服务器内部错误
                  value:
                    error:
                      message: Internal server error
                      type: server_error
                      code: internal_error
          headers: {}
          x-apifox-name: ''
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
      x-apifox-folder: AI模型接口/图像生成/gemini-3.1-flash-image-preview
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/7567950/apis/api-421308053-run
components:
  schemas:
    Gemini31FlashImageEditRequest:
      type: object
      required:
        - model
        - image
        - prompt
      properties:
        model:
          type: string
          enum:
            - gemini-3.1-flash-image-preview
          description: 图像生成模型名称
        image:
          oneOf:
            - type: string
            - type: array
              items:
                type: string
          description: >-
            输入图像，支持以下格式：

            - **Base64 data URI**：使用 `data:image/png;base64,` 前缀 + Base64
            编码的图像数据

            - **图片 URL**：可访问的公网图片链接，如 `https://example.com/image.jpg`

            - **数组形式**：支持传入多张图片，格式为 ["url1", "url2"] 或混合 data URI 和 URL


            建议使用高质量的输入图像以获得更好的编辑效果
        prompt:
          type: string
          description: |-
            图像编辑的文本描述提示词

            建议：
            - 清晰描述期望的编辑效果
            - 包含风格、色彩、构图等具体细节
            - 使用逗号分隔不同的描述要素

            示例：
            - "将图片中的天空改为日落时分的橙红色，增加温暖的氛围"
            - "将照片转换为油画风格，保持主体不变，增强色彩饱和度"
            - "移除背景中的杂物，让背景变得简洁干净"
        image_config:
          $ref: '#/components/schemas/Gemini31FlashImageConfig'
        temperature:
          type: number
          format: float
          minimum: 0
          maximum: 2
          description: 生成温度，取值范围：0.0-2.0
        top_p:
          type: number
          format: float
          minimum: 0
          maximum: 1
          description: 核采样参数，取值范围：0.0-1.0
        top_k:
          type: integer
          minimum: 1
          description: Top-K 采样参数，最小值：1
      x-apifox-orders:
        - model
        - image
        - prompt
        - image_config
        - temperature
        - top_p
        - top_k
      x-apifox-ignore-properties: []
      x-apifox-folder: ''
    Gemini31FlashImageConfig:
      type: object
      description: 图像配置对象，用于控制图像比例和分辨率（gemini-3.1-flash-image-preview 模型专用）
      properties:
        aspect_ratio:
          type: string
          description: >-
            图像宽高比，支持：1:1、1:4、1:8、3:2、2:3、3:4、4:1、4:3、4:5、5:4、8:1、9:16、16:9 和
            21:9
          enum:
            - '1:1'
            - '1:4'
            - '1:8'
            - '2:3'
            - '3:2'
            - '3:4'
            - '4:1'
            - '4:3'
            - '4:5'
            - '5:4'
            - '8:1'
            - '9:16'
            - '16:9'
            - '21:9'
          x-apifox-enum:
            - value: '1:1'
              name: ''
              description: ''
            - value: '2:3'
              name: ''
              description: ''
            - value: '3:2'
              name: ''
              description: ''
            - value: '3:4'
              name: ''
              description: ''
            - value: '4:1'
              name: ''
              description: ''
            - value: '4:3'
              name: ''
              description: ''
            - value: '4:5'
              name: ''
              description: ''
            - value: '5:4'
              name: ''
              description: ''
            - value: '8:1'
              name: ''
              description: ''
            - value: '9:16'
              name: ''
              description: ''
            - value: '16:9'
              name: ''
              description: ''
            - value: '21:9'
              name: ''
              description: ''
            - value: '1:4'
              name: ''
              description: ''
            - value: '1:8'
              name: ''
              description: ''
        image_size:
          type: string
          enum:
            - '512'
            - 1K
            - 2K
            - 4K
          description: 图像分辨率，支持 512、1K、2K、4K
      x-apifox-orders:
        - aspect_ratio
        - image_size
      x-apifox-ignore-properties: []
      x-apifox-folder: ''
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
