#!/usr/bin/env ruby
# frozen_string_literal: true

require "json"
require "net/http"
require "uri"

$LOAD_PATH.unshift(File.expand_path("../lib", __dir__))
require "usurahi/library_queue_store"

VALID_INTENTS = %w[interesting try-soon keep-for-later].freeze

def load_dotenv
  env_path = File.expand_path("../.env", __dir__)
  return unless File.file?(env_path)

  File.each_line(env_path) do |line|
    stripped = line.strip
    next if stripped.empty? || stripped.start_with?("#") || !stripped.include?("=")

    key, value = stripped.split("=", 2)
    ENV[key] ||= value.to_s.gsub(/\A["']|["']\z/, "")
  end
end

def parse_args(argv)
  args = argv.dup
  parsed = {
    "url" => "",
    "note" => "",
    "intent" => "",
    "excerpt" => "",
    "slack_channel" => "",
    "slack_thread_ts" => ""
  }

  until args.empty?
    token = args.shift
    if parsed["url"].empty? && !token.start_with?("--")
      parsed["url"] = token
      next
    end

    case token
    when "--note"
      parsed["note"] = args.shift.to_s
    when "--intent"
      parsed["intent"] = args.shift.to_s
    when "--excerpt"
      parsed["excerpt"] = args.shift.to_s
    when "--slack-channel"
      parsed["slack_channel"] = args.shift.to_s
    when "--slack-thread-ts"
      parsed["slack_thread_ts"] = args.shift.to_s
    else
      raise ArgumentError, "unknown argument: #{token}"
    end
  end

  if parsed["url"].empty?
    raise ArgumentError, "usage: ./library.sh add <url> [--note <text>] [--intent <value>] [--excerpt <text>]"
  end

  if !parsed["intent"].empty? && !VALID_INTENTS.include?(parsed["intent"])
    raise ArgumentError, "intent must be one of: interesting, try-soon, keep-for-later"
  end

  parsed
end

def now
  Time.now.utc.iso8601
end

def update_existing_item(items, url, patch)
  item = items.find { |entry| entry["url"] == url && entry["status"] == "pending" }
  return nil unless item

  patch.each do |key, value|
    if key == "slack" && value.is_a?(Hash)
      item["slack"] = (item["slack"] || {}).merge(value)
      next
    end
    item[key] = value unless value == ""
  end

  if item["source_type"] == "x" && patch["excerpt"].to_s != ""
    item["fetch_status"] = "manual"
    item.delete("fetch_error")
  end

  item["stage"] ||= "queued"
  item["error"] = nil
  item
end

def extract_x_meta(raw_url)
  parsed = URI.parse(raw_url)
  return nil unless %w[x.com www.x.com twitter.com www.twitter.com].include?(parsed.host)

  match = parsed.path.match(%r{\A/([^/]+)/status/(\d+)})
  return nil unless match

  { "source_type" => "x", "author_hint" => match[1], "post_id" => match[2] }
rescue URI::InvalidURIError
  nil
end

def fetch_x_post(post_id)
  token = ENV["X_BEARER_TOKEN"]
  return { "fetch_status" => "skipped", "fetch_error" => "X_BEARER_TOKEN is not set" } if token.to_s.empty?

  endpoint = URI("https://api.x.com/2/tweets/#{post_id}")
  params = {
    "expansions" => "author_id",
    "tweet.fields" => "author_id,created_at,text",
    "user.fields" => "username,name"
  }
  endpoint.query = URI.encode_www_form(params)

  request = Net::HTTP::Get.new(endpoint)
  request["Authorization"] = "Bearer #{token}"
  response = Net::HTTP.start(endpoint.hostname, endpoint.port, use_ssl: true) { |http| http.request(request) }
  payload = begin
    JSON.parse(response.body)
  rescue JSON::ParserError
    {}
  end
  normalize_x_response(response, payload)
rescue JSON::ParserError
  { "fetch_status" => "failed", "fetch_error" => "invalid JSON response" }
rescue StandardError => e
  { "fetch_status" => "failed", "fetch_error" => e.message }
end

def normalize_x_response(response, payload)
  unless response.is_a?(Net::HTTPSuccess)
    message = payload.fetch("detail", nil) || payload.fetch("title", nil) || "HTTP #{response.code}"
    return { "fetch_status" => "failed", "fetch_error" => message }
  end

  author = payload.dig("includes", "users", 0) || {}
  {
    "fetch_status" => "done",
    "fetched_at" => now,
    "author" => author["username"] || "",
    "author_name" => author["name"] || "",
    "text" => payload.dig("data", "text") || "",
    "posted_at" => payload.dig("data", "created_at") || ""
  }
end

def main(argv)
  load_dotenv
  args = parse_args(argv)
  queue = Usurahi::LibraryQueueStore.load_pending_queue
  items = queue["urls"].is_a?(Array) ? queue["urls"] : []

  if items.any? { |item| item["url"] == args["url"] && item["status"] == "pending" }
    updated = update_existing_item(items, args["url"], {
      "note" => args["note"],
      "intent" => args["intent"],
      "excerpt" => args["excerpt"],
      "slack" => args["slack_channel"].empty? ? nil : {
        "channel" => args["slack_channel"],
        "thread_ts" => args["slack_thread_ts"]
      }
    })
    Usurahi::LibraryQueueStore.save_pending_queue(queue)

    lines = ["⚠ すでにカウンターにある: #{args["url"]}"]
    lines << "  抜粋: 更新" unless updated["excerpt"].to_s.empty?
    lines << "  ひとこと: #{updated["note"]}" unless updated["note"].to_s.empty?
    lines << "  意図: #{updated["intent"]}" unless updated["intent"].to_s.empty?
    lines << "  状態: #{updated["fetch_status"]}" unless updated["fetch_status"].to_s.empty?
    puts lines.join("\n")
    return
  end

  item = {
    "url" => args["url"],
    "note" => args["note"],
    "intent" => args["intent"],
    "excerpt" => args["excerpt"],
    "status" => "pending",
    "stage" => "queued",
    "added_at" => now,
    "fetched_text" => "",
    "normalized_text" => "",
    "draft" => {
      "title" => "",
      "summary" => "",
      "tags" => [],
      "comment" => ""
    },
    "error" => nil
  }

  unless args["slack_channel"].empty?
    item["slack"] = {
      "channel" => args["slack_channel"],
      "thread_ts" => args["slack_thread_ts"],
      "notified_at" => ""
    }
  end

  x_meta = extract_x_meta(args["url"])
  if x_meta
    item["source_type"] = x_meta["source_type"]
    item["post_id"] = x_meta["post_id"]
    item["author_hint"] = x_meta["author_hint"]

    if args["excerpt"].empty?
      item.merge!(fetch_x_post(x_meta["post_id"]))
    else
      item["fetch_status"] = "manual"
    end
  else
    item["source_type"] = "link"
    item["fetch_status"] = "not-needed"
  end

  items << item
  queue["urls"] = items
  Usurahi::LibraryQueueStore.save_pending_queue(queue)

  lines = [
    "✓ 図書室カウンターに追加: #{args["url"]}",
    if item["source_type"] == "x"
      "  X入力: #{item["fetch_status"]}#{item["author"].to_s.empty? ? "" : " / @#{item["author"]}"}"
    else
      "  種別: #{item["source_type"]}"
    end
  ]
  lines << "  理由: #{item["fetch_error"]}" unless item["fetch_error"].to_s.empty?
  lines << "  抜粋: あり" unless args["excerpt"].empty?
  lines << "  意図: #{args["intent"]}" unless args["intent"].empty?
  lines << "  ひとこと: #{args["note"]}" unless args["note"].empty?
  puts lines.join("\n")
end

begin
  main(ARGV)
rescue StandardError => e
  warn "✗ #{e.message}"
  exit 1
end
