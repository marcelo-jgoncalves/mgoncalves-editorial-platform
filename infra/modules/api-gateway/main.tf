# --- 1. The REST API ---
resource "aws_api_gateway_rest_api" "main" {
  name        = "${var.project_name}-${var.environment}-api"
  description = "Main API for the Marcelo Gonçalves blog"

  endpoint_configuration {
    types = ["REGIONAL"]
  }
}

# Lambda Authorizer (REQUEST): replaces the old native COGNITO_USER_POOLS
# authorizer (removed after the BFF rollout was validated end to end) on
# every protected /admin/* route. Only the opaque session cookie (BFF) is
# accepted today - the Authorization Bearer fallback (Amplify client-side,
# legacy flow) was already removed from adminAuthorizer's own code (see
# backend/src/functions/adminAuthorizer/index.ts's header comment and its
# "Bearer sem cookie é Deny" test) - this comment described the transition
# period, found stale during the Block 4 full audit (docs/book/cases/CASE-008).
# identity_source stays "" regardless (see below): the authorizer still needs
# to be invoked even when no cookie is present, to return its own Deny.
# Cache TTL = 0: session revocation (logout, manual deletion) needs to take
# effect immediately, never serve a cached Allow decision for a session
# that's already been deleted.
#
# identity_source = "" (empty): when identity_source lists one or more
# headers, API Gateway treats ALL of them as required and returns 401
# (UnauthorizedException) WITHOUT ever invoking the Lambda if any of them is
# missing (confirmed via CloudWatch: zero log streams from adminAuthorizer).
# Attempt 1 (Cookie + Authorization together) failed because the normal flow
# only sends Cookie. Attempt 2 (just "Host", a header always present on any
# request) ALSO failed with the same no-invocation 401: Host is a
# reserved/pseudo-header that API Gateway doesn't accept as a valid identity
# source (confirmed via curl directly against API Gateway, with no
# CloudFront in between). An empty identity source is AWS's documented
# pattern for "always invoke, without requiring any specific header": the
# Lambda decides internally based on which header (Cookie or Authorization)
# actually came in.
resource "aws_api_gateway_authorizer" "admin_cookie_auth" {
  name                             = "AdminCookieAuthorizer"
  type                             = "REQUEST"
  rest_api_id                      = aws_api_gateway_rest_api.main.id
  authorizer_uri                   = var.admin_authorizer_invoke_arn
  identity_source                  = ""
  authorizer_result_ttl_in_seconds = 0
}

resource "aws_lambda_permission" "apigw_admin_authorizer" {
  statement_id  = "AllowAPIGatewayInvokeAdminAuthorizer"
  action        = "lambda:InvokeFunction"
  function_name = var.admin_authorizer_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/authorizers/${aws_api_gateway_authorizer.admin_cookie_auth.id}"
}

# Gateway Responses: when the Cognito authorizer rejects the request
# (expired/invalid/missing token), API Gateway generates the error response
# itself, without going through the Lambda, and therefore without the CORS
# headers the Lambda normally returns. Without this, the browser blocks the
# response and fetch() fails with "TypeError: Failed to fetch" instead of
# the real 401/403, hiding the expired-session error from the admin's
# retry/redirect handling.
resource "aws_api_gateway_gateway_response" "unauthorized_cors" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  response_type = "UNAUTHORIZED"
  status_code   = "401"

  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Origin"  = "'${var.admin_origin}'"
    "gatewayresponse.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "gatewayresponse.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,OPTIONS'"
  }

  # Declared explicitly because the AWS provider (v6+) treats an omitted
  # response_templates as "should be empty" and strips the JSON error
  # template API Gateway applies by default -- an older provider left an
  # omitted attribute undiffed against that default, so this went unnoticed
  # until upgrading. Declaring the current value here preserves the real
  # error body without changing anything.
  response_templates = {
    "application/json" = "{\"message\":$context.error.messageString}"
  }
}

resource "aws_api_gateway_gateway_response" "access_denied_cors" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  response_type = "ACCESS_DENIED"
  status_code   = "403"

  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Origin"  = "'${var.admin_origin}'"
    "gatewayresponse.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "gatewayresponse.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,OPTIONS'"
  }

  # See the comment on unauthorized_cors above -- same case.
  response_templates = {
    "application/json" = "{\"message\":$context.error.messageString}"
  }
}

resource "aws_api_gateway_gateway_response" "default_4xx_cors" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  response_type = "DEFAULT_4XX"

  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Origin"  = "'${var.admin_origin}'"
    "gatewayresponse.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "gatewayresponse.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,OPTIONS'"
  }

  # See the comment on unauthorized_cors above -- same case.
  response_templates = {
    "application/json" = "{\"message\":$context.error.messageString}"
  }
}

resource "aws_api_gateway_gateway_response" "default_5xx_cors" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  response_type = "DEFAULT_5XX"

  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Origin"  = "'${var.admin_origin}'"
    "gatewayresponse.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "gatewayresponse.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,OPTIONS'"
  }

  # See the comment on unauthorized_cors above -- same case.
  response_templates = {
    "application/json" = "{\"message\":$context.error.messageString}"
  }
}

# --- 2. Resources (Paths) ---

resource "aws_api_gateway_resource" "post" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "post"
}

resource "aws_api_gateway_resource" "post_slug" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.post.id
  path_part   = "{slug}"
}

resource "aws_api_gateway_resource" "autor" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "autor"
}

resource "aws_api_gateway_resource" "autor_id" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.autor.id
  path_part   = "{id}"
}

# --- 3. Methods and Integrations (Lambda wiring) ---

resource "aws_api_gateway_method" "get_post" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.post_slug.id
  http_method   = "GET"
  authorization = "NONE"
}

# --- Admin Resources ---


# /admin/autores (plural): declared, but no method/integration was ever
# attached to it - found orphaned during the Block 4 full audit
# (docs/book/cases/CASE-008). The admin UI has no author-list feature (single
# fixed AUTHOR_ID constant, admin/src/views/AuthorEditView.vue) and
# admin/src/services/api.ts's authorsApi has no list(). Kept as-is (not
# deleted) pending a product decision: either a real list/create feature is
# planned and this is intentional scaffolding, or it's dead infrastructure to
# remove. Not a security or functional risk either way - API Gateway returns
# its default "Missing Authentication Token" for any request here, the same
# as any undefined path.
resource "aws_api_gateway_resource" "admin_autores" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.admin.id
  path_part   = "autores"
}

# /admin/autor (singular - the public 'autor' parent resource already exists, but this one is a child of 'admin')
resource "aws_api_gateway_resource" "admin_autor_singular" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.admin.id
  path_part   = "autor"
}

resource "aws_api_gateway_resource" "admin_autor_id" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.admin_autor_singular.id
  path_part   = "{id}"
}


resource "aws_api_gateway_resource" "admin" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "admin"
}

# /admin/session: BFF login/me/logout. No authorizer on any method:
# POST (login) needs to be reachable without a prior session (it's what
# creates one); GET (me) and DELETE (logout) do their own cookie check
# inside the handler (backend/src/functions/adminSession), so an authorizer
# in front would be a duplicate check and would prevent "no session" from
# cleanly returning 401 (a Lambda Authorizer with Deny returns 403, not 401).
resource "aws_api_gateway_resource" "admin_session" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.admin.id
  path_part   = "session"
}

# 3 separate methods (not a single ANY): API Gateway's UpdateStage only
# accepts method_path as "{resourcePath}/{real httpMethod}" or "*/*", there
# is no "specific resource + all verbs" combination when the method is
# modeled as ANY. Splitting into GET/POST/DELETE lets us target only POST
# (login, the verb sensitive to brute force) with the tighter limit, leaving
# GET (me)/DELETE (logout) on the global throttle_all only.
resource "aws_api_gateway_method" "admin_session_post" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.admin_session.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "admin_session_get" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.admin_session.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "admin_session_delete" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.admin_session.id
  http_method   = "DELETE"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "admin_session_post_integration" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.admin_session.id
  http_method             = aws_api_gateway_method.admin_session_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.admin_session_invoke_arn
}

resource "aws_api_gateway_integration" "admin_session_get_integration" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.admin_session.id
  http_method             = aws_api_gateway_method.admin_session_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.admin_session_invoke_arn
}

resource "aws_api_gateway_integration" "admin_session_delete_integration" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.admin_session.id
  http_method             = aws_api_gateway_method.admin_session_delete.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.admin_session_invoke_arn
}

resource "aws_lambda_permission" "apigw_admin_session" {
  statement_id  = "AllowAPIGatewayInvokeAdminSession"
  action        = "lambda:InvokeFunction"
  function_name = var.admin_session_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}

resource "aws_api_gateway_resource" "admin_posts" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.admin.id
  path_part   = "posts"
}

resource "aws_api_gateway_resource" "admin_post_singular" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.admin.id
  path_part   = "post"
}

resource "aws_api_gateway_resource" "admin_post_slug" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.admin_post_singular.id
  path_part   = "{slug}"
}

resource "aws_api_gateway_method" "admin_post_slug_any" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.admin_post_slug.id
  http_method   = "ANY"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.admin_cookie_auth.id
}

resource "aws_api_gateway_integration" "admin_post_slug_integration" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.admin_post_slug.id
  http_method             = aws_api_gateway_method.admin_post_slug_any.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.admin_posts_invoke_arn # Reuses the same Lambda
}

# --- CORS (OPTIONS) for /admin/post/{slug}, /admin/autor/{id},
# /admin/posts, /admin/media/upload-url, /admin/categorias, and
# /admin/categorias/{slug} -- see local.cors_preflight_endpoints and the 4
# "cors_preflight" for_each resources right before aws_api_gateway_deployment.main.

resource "aws_api_gateway_method" "admin_autor_id_any" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.admin_autor_id.id
  http_method   = "ANY"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.admin_cookie_auth.id
}

resource "aws_api_gateway_integration" "admin_autor_id_integration" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.admin_autor_id.id
  http_method             = aws_api_gateway_method.admin_autor_id_any.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.admin_authors_invoke_arn
}

# OPTIONS /admin/autor/{id} (CORS) -- see local.cors_preflight_endpoints

resource "aws_lambda_permission" "apigw_admin_authors" {
  statement_id  = "AllowAPIGatewayInvokeAdminAuthors"
  action        = "lambda:InvokeFunction"
  function_name = var.admin_authors_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}

resource "aws_api_gateway_integration" "get_populares_integration" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.posts_populares.id
  http_method             = aws_api_gateway_method.get_populares.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.get_posts_invoke_arn
}

resource "aws_api_gateway_resource" "posts_populares" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.posts.id
  path_part   = "populares"
}

resource "aws_api_gateway_method" "get_populares" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.posts_populares.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "admin_posts_any" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.admin_posts.id
  http_method = "ANY"

  # This is where the actual access control happens:
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.admin_cookie_auth.id
}

resource "aws_api_gateway_integration" "admin_posts_integration" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.admin_posts.id
  http_method             = aws_api_gateway_method.admin_posts_any.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.admin_posts_invoke_arn
}

# OPTIONS /admin/posts (CORS Preflight) -- see local.cors_preflight_endpoints

resource "aws_lambda_permission" "apigw_admin_posts" {
  statement_id  = "AllowAPIGatewayInvokeAdminPosts"
  action        = "lambda:InvokeFunction"
  function_name = var.admin_posts_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}

resource "aws_api_gateway_integration" "get_post_integration" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.post_slug.id
  http_method             = aws_api_gateway_method.get_post.http_method
  integration_http_method = "POST" # Lambda invocation always requires POST
  type                    = "AWS_PROXY"
  uri                     = var.get_post_invoke_arn
}

resource "aws_api_gateway_resource" "admin_media" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.admin.id
  path_part   = "media"
}

resource "aws_api_gateway_resource" "admin_media_upload" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.admin_media.id
  path_part   = "upload-url"
}

resource "aws_api_gateway_method" "media_upload_post" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.admin_media_upload.id
  http_method   = "POST"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.admin_cookie_auth.id
}

resource "aws_api_gateway_integration" "media_upload_integration" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.admin_media_upload.id
  http_method             = aws_api_gateway_method.media_upload_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.media_upload_invoke_arn
}

# OPTIONS /admin/media/upload-url (CORS) -- see local.cors_preflight_endpoints
# Only endpoint with a different Allow-Methods (POST,OPTIONS -- doesn't accept
# GET/PUT/DELETE, it's upload-only), parameterized in the map instead of being
# a special case.

resource "aws_lambda_permission" "apigw_media_upload" {
  statement_id  = "AllowAPIGatewayInvokeMediaUpload"
  action        = "lambda:InvokeFunction"
  function_name = var.media_upload_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}

resource "aws_api_gateway_method" "get_author" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.autor_id.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "get_author_integration" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.autor_id.id
  http_method             = aws_api_gateway_method.get_author.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.get_author_invoke_arn
}

# --- 4. Permissions (Lambda Permission) ---
# Required for API Gateway to have permission to invoke the function

resource "aws_lambda_permission" "apigw_get_post" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.get_post_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "apigw_get_author" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.get_author_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}

# --- 5. Deploy and Stage ---

resource "aws_api_gateway_stage" "main" {
  deployment_id        = aws_api_gateway_deployment.main.id
  rest_api_id          = aws_api_gateway_rest_api.main.id
  stage_name           = "v1"
  xray_tracing_enabled = var.enable_xray_tracing
}

# Throttling applied to every method on the stage (*/*), without requiring
# an API key, this also protects the public read routes, which today have
# no auth layer of their own to enforce that limit otherwise.
resource "aws_api_gateway_method_settings" "throttle_all" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  stage_name  = aws_api_gateway_stage.main.stage_name
  method_path = "*/*"

  settings {
    throttling_rate_limit  = var.throttle_rate_limit
    throttling_burst_limit = var.throttle_burst_limit
  }
}

# Tighter limit only on login (POST /admin/session): it verifies a JWT and
# creates a session, making it the natural target for brute force/replay;
# the global throttle (var.throttle_rate_limit) is sized for public read
# traffic, far too generous for a single admin auth endpoint.
#
# method_path doesn't accept a wildcard verb (neither "*" nor "ANY")
# combined with a specific resourcePath, only "{resourcePath}/{real
# httpMethod}" or "*/*" (confirmed via the API's actual error:
# "'admin/session/*' is not a valid method path"). That's why the
# /admin/session resource was split into 3 real methods (POST/GET/DELETE,
# see above) instead of a single ANY, only that way can we target
# exclusively the POST here. GET (me)/DELETE (logout) stay on the global
# throttle_all only.
resource "aws_api_gateway_method_settings" "throttle_admin_session" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  stage_name  = aws_api_gateway_stage.main.stage_name
  method_path = "admin/session/POST"

  settings {
    throttling_rate_limit  = 5
    throttling_burst_limit = 10
  }
}

# --- 1. Listing Resources ---

# /posts (the singular /post already exists, this is the plural)
resource "aws_api_gateway_resource" "posts" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "posts"
}

# /posts/recentes
resource "aws_api_gateway_resource" "posts_recentes" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.posts.id
  path_part   = "recentes"
}

# /artigos
resource "aws_api_gateway_resource" "artigos" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "artigos"
}

# /categoria
resource "aws_api_gateway_resource" "categoria" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "categoria"
}

# /categoria/{slug}
resource "aws_api_gateway_resource" "categoria_slug" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.categoria.id
  path_part   = "{slug}"
}

# --- 2. Integrations with the getPosts Lambda ---

# A. GET /posts/recentes
resource "aws_api_gateway_method" "get_recentes" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.posts_recentes.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "get_recentes_integration" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.posts_recentes.id
  http_method             = aws_api_gateway_method.get_recentes.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.get_posts_invoke_arn
}

# B. GET /artigos (paginated)
resource "aws_api_gateway_method" "get_artigos" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.artigos.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "get_artigos_integration" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.artigos.id
  http_method             = aws_api_gateway_method.get_artigos.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.get_posts_invoke_arn
}

# C. GET /categoria/{slug}
resource "aws_api_gateway_method" "get_categoria" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.categoria_slug.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "get_categoria_integration" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.categoria_slug.id
  http_method             = aws_api_gateway_method.get_categoria.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.get_posts_invoke_arn
}

# Allows API Gateway to invoke the getPosts Lambda
resource "aws_lambda_permission" "apigw_get_posts" {
  statement_id  = "AllowAPIGatewayInvokeGetPosts"
  action        = "lambda:InvokeFunction"
  function_name = var.get_posts_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}

# /busca resource
resource "aws_api_gateway_resource" "busca" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "busca"
}

# GET method /busca
resource "aws_api_gateway_method" "get_busca" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.busca.id
  http_method   = "GET"
  authorization = "NONE"
}

# Integration GET /busca -> getPosts Lambda
resource "aws_api_gateway_integration" "get_busca_integration" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.busca.id
  http_method             = aws_api_gateway_method.get_busca.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.get_posts_invoke_arn
}

# --- /projeto resource (Timeline) ---
resource "aws_api_gateway_resource" "projeto" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "projeto"
}

# GET method /projeto
resource "aws_api_gateway_method" "get_projeto" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.projeto.id
  http_method   = "GET"
  authorization = "NONE"
}

# Integration /projeto -> getPosts Lambda
resource "aws_api_gateway_integration" "get_projeto_integration" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.projeto.id
  http_method             = aws_api_gateway_method.get_projeto.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.get_posts_invoke_arn
}

# --- /admin/categorias ---

resource "aws_api_gateway_resource" "admin_categorias" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.admin.id
  path_part   = "categorias"
}

resource "aws_api_gateway_resource" "admin_categorias_slug" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.admin_categorias.id
  path_part   = "{slug}"
}

resource "aws_api_gateway_method" "admin_categorias_any" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.admin_categorias.id
  http_method   = "ANY"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.admin_cookie_auth.id
}

resource "aws_api_gateway_integration" "admin_categorias_integration" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.admin_categorias.id
  http_method             = aws_api_gateway_method.admin_categorias_any.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.admin_categorias_invoke_arn
}

# OPTIONS /admin/categorias (CORS) -- see local.cors_preflight_endpoints

resource "aws_api_gateway_method" "admin_categorias_slug_any" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.admin_categorias_slug.id
  http_method   = "ANY"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.admin_cookie_auth.id
}

resource "aws_api_gateway_integration" "admin_categorias_slug_integration" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.admin_categorias_slug.id
  http_method             = aws_api_gateway_method.admin_categorias_slug_any.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.admin_categorias_invoke_arn
}

# OPTIONS /admin/categorias/{slug} (CORS) -- see local.cors_preflight_endpoints

resource "aws_lambda_permission" "apigw_admin_categorias" {
  statement_id  = "AllowAPIGatewayInvokeAdminCategorias"
  action        = "lambda:InvokeFunction"
  function_name = var.admin_categorias_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}

# --- Shared CORS Preflight (OPTIONS) ---
# The 6 endpoints below had the same 4-resource pattern (method OPTIONS +
# integration MOCK + method_response 200 + integration_response) copied by
# hand. Unified into a for_each -- only media_upload genuinely diverges
# (Allow-Methods "POST,OPTIONS" instead of "GET,OPTIONS,POST,PUT,DELETE"),
# so it becomes a map parameter instead of a special case outside the pattern.
#
# The 24 `moved` blocks below (6 endpoints x 4 resource types) preserve the
# mapping in state -- without them, this address change would be a
# destroy+create of each of these resources on the next apply, dropping that
# route's CORS preflight during the apply window.
moved {
  from = aws_api_gateway_method.admin_post_slug_options
  to   = aws_api_gateway_method.cors_preflight["admin_post_slug"]
}
moved {
  from = aws_api_gateway_integration.admin_post_slug_options_integration
  to   = aws_api_gateway_integration.cors_preflight["admin_post_slug"]
}
moved {
  from = aws_api_gateway_method_response.admin_post_slug_options_200
  to   = aws_api_gateway_method_response.cors_preflight_200["admin_post_slug"]
}
moved {
  from = aws_api_gateway_integration_response.admin_post_slug_options_integration_response
  to   = aws_api_gateway_integration_response.cors_preflight["admin_post_slug"]
}

moved {
  from = aws_api_gateway_method.admin_autor_id_options
  to   = aws_api_gateway_method.cors_preflight["admin_autor_id"]
}
moved {
  from = aws_api_gateway_integration.admin_autor_id_options_integration
  to   = aws_api_gateway_integration.cors_preflight["admin_autor_id"]
}
moved {
  from = aws_api_gateway_method_response.admin_autor_id_options_200
  to   = aws_api_gateway_method_response.cors_preflight_200["admin_autor_id"]
}
moved {
  from = aws_api_gateway_integration_response.admin_autor_id_options_response
  to   = aws_api_gateway_integration_response.cors_preflight["admin_autor_id"]
}

moved {
  from = aws_api_gateway_method.admin_posts_options
  to   = aws_api_gateway_method.cors_preflight["admin_posts"]
}
moved {
  from = aws_api_gateway_integration.admin_posts_options_integration
  to   = aws_api_gateway_integration.cors_preflight["admin_posts"]
}
moved {
  from = aws_api_gateway_method_response.admin_posts_options_200
  to   = aws_api_gateway_method_response.cors_preflight_200["admin_posts"]
}
moved {
  from = aws_api_gateway_integration_response.admin_posts_options_integration_response
  to   = aws_api_gateway_integration_response.cors_preflight["admin_posts"]
}

moved {
  from = aws_api_gateway_method.media_upload_options
  to   = aws_api_gateway_method.cors_preflight["media_upload"]
}
moved {
  from = aws_api_gateway_integration.media_upload_options_integration
  to   = aws_api_gateway_integration.cors_preflight["media_upload"]
}
moved {
  from = aws_api_gateway_method_response.media_upload_options_200
  to   = aws_api_gateway_method_response.cors_preflight_200["media_upload"]
}
moved {
  from = aws_api_gateway_integration_response.media_upload_options_response
  to   = aws_api_gateway_integration_response.cors_preflight["media_upload"]
}

moved {
  from = aws_api_gateway_method.admin_categorias_options
  to   = aws_api_gateway_method.cors_preflight["admin_categorias"]
}
moved {
  from = aws_api_gateway_integration.admin_categorias_options_integration
  to   = aws_api_gateway_integration.cors_preflight["admin_categorias"]
}
moved {
  from = aws_api_gateway_method_response.admin_categorias_options_200
  to   = aws_api_gateway_method_response.cors_preflight_200["admin_categorias"]
}
moved {
  from = aws_api_gateway_integration_response.admin_categorias_options_response
  to   = aws_api_gateway_integration_response.cors_preflight["admin_categorias"]
}

moved {
  from = aws_api_gateway_method.admin_categorias_slug_options
  to   = aws_api_gateway_method.cors_preflight["admin_categorias_slug"]
}
moved {
  from = aws_api_gateway_integration.admin_categorias_slug_options_integration
  to   = aws_api_gateway_integration.cors_preflight["admin_categorias_slug"]
}
moved {
  from = aws_api_gateway_method_response.admin_categorias_slug_options_200
  to   = aws_api_gateway_method_response.cors_preflight_200["admin_categorias_slug"]
}
moved {
  from = aws_api_gateway_integration_response.admin_categorias_slug_options_response
  to   = aws_api_gateway_integration_response.cors_preflight["admin_categorias_slug"]
}

locals {
  cors_preflight_endpoints = {
    admin_post_slug = {
      resource_id   = aws_api_gateway_resource.admin_post_slug.id
      allow_methods = "GET,OPTIONS,POST,PUT,DELETE"
    }
    admin_autor_id = {
      resource_id   = aws_api_gateway_resource.admin_autor_id.id
      allow_methods = "GET,OPTIONS,POST,PUT,DELETE"
    }
    admin_posts = {
      resource_id   = aws_api_gateway_resource.admin_posts.id
      allow_methods = "GET,OPTIONS,POST,PUT,DELETE"
    }
    media_upload = {
      resource_id   = aws_api_gateway_resource.admin_media_upload.id
      allow_methods = "POST,OPTIONS"
    }
    admin_categorias = {
      resource_id   = aws_api_gateway_resource.admin_categorias.id
      allow_methods = "GET,OPTIONS,POST,PUT,DELETE"
    }
    admin_categorias_slug = {
      resource_id   = aws_api_gateway_resource.admin_categorias_slug.id
      allow_methods = "GET,OPTIONS,POST,PUT,DELETE"
    }
  }
}

resource "aws_api_gateway_method" "cors_preflight" {
  for_each      = local.cors_preflight_endpoints
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = each.value.resource_id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "cors_preflight" {
  for_each          = local.cors_preflight_endpoints
  rest_api_id       = aws_api_gateway_rest_api.main.id
  resource_id       = each.value.resource_id
  http_method       = aws_api_gateway_method.cors_preflight[each.key].http_method
  type              = "MOCK"
  request_templates = { "application/json" = "{\"statusCode\": 200}" }
}

resource "aws_api_gateway_method_response" "cors_preflight_200" {
  for_each    = local.cors_preflight_endpoints
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = each.value.resource_id
  http_method = aws_api_gateway_method.cors_preflight[each.key].http_method
  status_code = "200"

  response_models = { "application/json" = "Empty" }

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true,
    "method.response.header.Access-Control-Allow-Methods" = true,
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "cors_preflight" {
  for_each    = local.cors_preflight_endpoints
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = each.value.resource_id
  http_method = aws_api_gateway_method.cors_preflight[each.key].http_method
  status_code = aws_api_gateway_method_response.cors_preflight_200[each.key].status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
    "method.response.header.Access-Control-Allow-Methods" = "'${each.value.allow_methods}'",
    "method.response.header.Access-Control-Allow-Origin"  = "'${var.admin_origin}'"
  }

  depends_on = [aws_api_gateway_method_response.cors_preflight_200]
}

# Triggers

resource "aws_api_gateway_deployment" "main" {
  rest_api_id = aws_api_gateway_rest_api.main.id

  # Hash of this whole file, not a hand-maintained resource list: the old
  # list (~50 entries) had to be updated for every new route and had already
  # missed resources at least once (documented gap on media_upload preflight
  # before the for_each unification). Any change to any resource in this
  # module lives in this file, so its hash over-approximates "something
  # changed", a rare redeploy too many is harmless (create_before_destroy),
  # a missing redeploy silently serves the old API.
  triggers = {
    redeployment = filesha1("${path.module}/main.tf")
  }

  lifecycle {
    create_before_destroy = true
  }
}
