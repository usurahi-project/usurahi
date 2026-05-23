# frozen_string_literal: true

require "fileutils"
require "time"
require "yaml"

module Usurahi
  module LibraryQueueStore
    HISTORY_LIMIT = 200

    module_function

    def basedir
      ENV["USURAHI_BASEDIR"] || File.expand_path("../..", __dir__)
    end

    def queue_file
      File.join(basedir, "queue", "library_queue.yaml")
    end

    def history_file
      File.join(basedir, "queue", "library_history.yaml")
    end

    def timestamp
      Time.now.utc.iso8601
    end

    def load_pending_queue
      data = read_yaml(queue_file, { "urls" => [] })
      items = array_value(data["urls"])
      pending = items.select { |item| item["status"] == "pending" }
      legacy_history = items.select { |item| item["status"] && item["status"] != "pending" }

      unless legacy_history.empty?
        history = load_library_history
        migrated = legacy_history.map do |item|
          deep_copy(item).merge(
            "history_recorded_at" => item["history_recorded_at"] || timestamp,
            "migrated_from_queue_at" => timestamp
          )
        end
        history["entries"] = (migrated + history["entries"]).first(HISTORY_LIMIT)
        save_library_history(history)
        write_yaml(queue_file, "urls" => pending)
      end

      { "urls" => pending }
    end

    def save_pending_queue(data)
      items = array_value(data["urls"])
      write_yaml(queue_file, "urls" => items.select { |item| item["status"] == "pending" })
    end

    def load_library_history
      data = read_yaml(history_file, { "entries" => [] })
      { "entries" => array_value(data["entries"]) }
    end

    def save_library_history(data)
      entries = array_value(data["entries"])
      write_yaml(history_file, "entries" => entries.first(HISTORY_LIMIT))
    end

    def record_library_history(item)
      return if item.nil? || item["url"].to_s.empty? || item["status"].to_s.empty? || item["status"] == "pending"

      history = load_library_history
      history["entries"].unshift(deep_copy(item).merge("history_recorded_at" => timestamp))
      save_library_history(history)
    end

    def latest_history_entries(entries)
      seen = {}
      array_value(entries).each_with_object([]) do |entry, result|
        url = entry["url"]
        next if url.to_s.empty? || seen[url]

        seen[url] = true
        result << entry
      end
    end

    def latest_failed_entries
      latest_history_entries(load_library_history["entries"]).select { |entry| entry["status"] == "failed" }
    end

    def find_latest_history_by_url(url)
      return nil if url.to_s.empty?

      load_library_history["entries"].find { |entry| entry["url"] == url }
    end

    def read_yaml(file_path, fallback)
      return fallback unless File.exist?(file_path)

      YAML.load_file(file_path) || fallback
    end

    def write_yaml(file_path, data)
      FileUtils.mkdir_p(File.dirname(file_path))
      File.write(file_path, YAML.dump(data), mode: "w")
    end

    def array_value(value)
      value.is_a?(Array) ? value : []
    end

    def deep_copy(value)
      Marshal.load(Marshal.dump(value))
    end
  end
end
