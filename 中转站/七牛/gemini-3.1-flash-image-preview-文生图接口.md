# 文生图接口 - 根据文本描述生成图像

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
      summary: 文生图接口 - 根据文本描述生成图像
      deprecated: false
      description: 根据文本描述生成全新的图像，支持多种分辨率和宽高比配置。
      operationId: createImageGeneration
      tags:
        - AI模型接口/图像生成/gemini-3.1-flash-image-preview
        - 图像生成/gemini-3.1-flash-image-preview
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/Gemini31FlashImageGenerationRequest'
            examples:
              basic:
                value:
                  model: gemini-3.1-flash-image-preview
                  prompt: 一只可爱的橘猫坐在窗台上看着夕阳，照片风格，高清画质
                summary: 基础文生图
              with-4k-config:
                value:
                  model: gemini-3.1-flash-image-preview
                  prompt: 一只可爱的橘猫坐在窗台上看着夕阳，照片风格，高清画质
                  image_config:
                    aspect_ratio: '16:9'
                    image_size: 4K
                summary: 生成4K高清图像
              with-2k-config:
                value:
                  model: gemini-3.1-flash-image-preview
                  prompt: 梦幻森林中的精灵小屋，魔法光芒环绕
                  image_config:
                    aspect_ratio: '9:16'
                    image_size: 2K
                summary: 生成2K图像
              with-sampling:
                value:
                  model: gemini-3.1-flash-image-preview
                  prompt: 梦幻森林中的精灵小屋，魔法光芒环绕
                  temperature: 0.8
                  top_p: 0.95
                summary: 使用采样参数控制生成
      responses:
        '200':
          description: 请求成功
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ImageGenerationResponse'
              examples:
                '1':
                  summary: 成功示例
                  value:
                    created: 1234567890
                    data:
                      - b64_json: iVBORw0KGgoAAAANSUhEUgA...
                    output_format: png
                    usage:
                      total_tokens: 5234
                      input_tokens: 234
                      output_tokens: 5000
                      input_tokens_details:
                        text_tokens: 234
                        image_tokens: 0
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
      x-run-in-apifox: https://app.apifox.com/web/project/7567950/apis/api-421308052-run
components:
  schemas:
    Gemini31FlashImageGenerationRequest:
      type: object
      required:
        - model
        - prompt
      properties:
        model:
          type: string
          enum:
            - gemini-3.1-flash-image-preview
          description: 图像生成模型名称
        prompt:
          type: string
          description: |-
            图像生成的文本描述提示词

            建议：
            - 提示词越详细、具体，生成的图像质量越好
            - 建议包含：风格、光线、构图、色彩等细节
            - 使用逗号分隔不同的描述要素

            示例："一只橘色的猫，坐在窗台上，温暖的阳光，柔和的阴影，专业摄影，高清画质，4K 分辨率"
        image_config:
          $ref: '#/components/schemas/Gemini31FlashImageConfig'
        temperature:
          type: number
          format: float
          minimum: 0
          maximum: 2
          description: |-
            生成温度，取值范围：0.0-2.0

            控制生成的随机性和创意性：
            - 较低的值（如 0.2）使输出更确定和一致
            - 较高的值（如 1.0）使输出更随机和创意
        top_p:
          type: number
          format: float
          minimum: 0
          maximum: 1
          description: |-
            核采样参数，取值范围：0.0-1.0

            用于控制生成的多样性：
            - 较低的值会使生成更集中于高概率选项
            - 注意：不建议同时修改 temperature 和 top_p
        top_k:
          type: integer
          minimum: 1
          description: |-
            Top-K 采样参数，最小值：1

            限制每步采样时考虑的候选项数量
      x-apifox-orders:
        - model
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
