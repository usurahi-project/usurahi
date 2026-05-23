# frozen_string_literal: true

require "fileutils"
require "open3"
require "tmpdir"
require "yaml"
require "minitest/autorun"

class LibraryAddTest < Minitest::Test
  ROOT = File.expand_path("..", __dir__)
  SCRIPT = File.join(ROOT, "scripts", "library-add.rb")

  def setup
    @dir = Dir.mktmpdir("usurahi-library-add")
    FileUtils.mkdir_p(File.join(@dir, "queue"))
  end

  def teardown
    FileUtils.remove_entry(@dir)
  end

  def test_adds_link_to_pending_queue
    stdout, stderr, status = run_script("https://example.com/article", "--note", "memo", "--intent", "interesting")

    assert(status.success?, stderr)
    assert_includes(stdout, "図書室カウンターに追加")
    item = YAML.load_file(File.join(@dir, "queue", "library_queue.yaml")).fetch("urls").first
    assert_equal("https://example.com/article", item["url"])
    assert_equal("memo", item["note"])
    assert_equal("interesting", item["intent"])
    assert_equal("link", item["source_type"])
    assert_equal("not-needed", item["fetch_status"])
  end

  def test_updates_duplicate_pending_item
    run_script("https://example.com/article")
    stdout, stderr, status = run_script("https://example.com/article", "--note", "updated")

    assert(status.success?, stderr)
    assert_includes(stdout, "すでにカウンターにある")
    urls = YAML.load_file(File.join(@dir, "queue", "library_queue.yaml")).fetch("urls")
    assert_equal(1, urls.length)
    assert_equal("updated", urls.first["note"])
  end

  def test_rejects_unknown_intent
    _stdout, stderr, status = run_script("https://example.com/article", "--intent", "now")

    refute(status.success?)
    assert_includes(stderr, "intent must be one of")
  end

  def test_adds_x_url_with_manual_excerpt_without_network
    stdout, stderr, status = run_script("https://x.com/user/status/12345", "--excerpt", "quoted text")

    assert(status.success?, stderr)
    assert_includes(stdout, "X入力: manual")
    item = YAML.load_file(File.join(@dir, "queue", "library_queue.yaml")).fetch("urls").first
    assert_equal("x", item["source_type"])
    assert_equal("12345", item["post_id"])
    assert_equal("user", item["author_hint"])
    assert_equal("manual", item["fetch_status"])
  end

  private

  def run_script(*args)
    Open3.capture3({ "USURAHI_BASEDIR" => @dir }, "ruby", SCRIPT, *args)
  end
end
