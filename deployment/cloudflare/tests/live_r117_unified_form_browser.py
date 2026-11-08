"""R117 isolated Chromium desktop+mobile single-case-form regression.
Synthetic HTTP API only. No account, live Cloudflare, provider or real documents.
"""
import json
import hashlib
import uuid
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[3]/"web"/"r0-preview"
I="44444444-4444-4444-8444-444444444444"
U="22222222-2222-4222-8222-222222222222"
T="33333333-3333-4333-8333-333333333333"
F="55555555-5555-4555-8555-555555555555"
class Quiet(SimpleHTTPRequestHandler):
    def __init__(self,*a,**kw):super().__init__(*a,directory=str(ROOT),**kw)
    def log_message(self,*_):pass

def scenario(browser,name,viewport,origin):
    cases=[]
    files={}
    calls=[]
    def as_row(c):
        return dict(id=c["id"],title=c["title"],created_at=1800000000,
            version=c.get("title_version",1),can_write=True,
            category=c["details"]["category"],case_status=c["details"]["status"],
            case_reference=c["details"]["reference"])
    def reply(route,status=200,payload=None):
        route.fulfill(status=status,content_type="application/json",body=json.dumps(payload or {}))
    def intercepted(route):
        req=route.request
        u=urlsplit(req.url).path
        method=req.method
        calls.append((method,u))
        if u=="/api/qa/session":
            return reply(route,payload={"email":"qa@example.invalid","role":"lawyer","workspace_type":"organization"})
        if u=="/api/qa/workspaces":
            return reply(route,payload={"workspaces":[]})
        if u=="/api/qa/profile":
            return reply(route,payload={"display_name":"Lawyer QA","plan_code":"demo"})
        if u=="/api/qa/legal/run" and method=="POST":
            data=json.loads(req.post_data)
            if data["uc"]=="UC04":
                assert data["matter_id"]==F
                assert data["synthetic_consent"] is True
                return reply(route,payload={
                    "uc":"UC04","title":"Tóm tắt văn bản",
                    "mode":"ai_draft_not_verified",
                    "source_hash":"a"*64,"source_anchors":[
                        {"id":"A1","preview":"Điều 1. Bên A thanh toán"},
                        {"id":"A2","preview":"Điều 2. Bên B bàn giao"}],
                    "answer":"[A1] Bên A thanh toán 2,000,000 đồng ngày 15/09/2026.",
                    "review_notice":"Chỉ là bản tóm tắt QA cần kiểm duyệt.",
                    "summary_review":{
                        "status":"review_required",
                        "critical_source_count":2,"marked_critical_count":1,
                        "missing_critical_source_count":1,
                        "missing_critical_source_ids":["A2"],
                        "source_number_count":3,
                        "missing_number_count":1,"missing_numbers":["10"],
                        "source_date_count":2,"missing_date_count":1,
                        "missing_dates":["20/9/2026"],
                        "review_required":True}
                })
            assert data["uc"]=="UC03"
            assert data["matter_id"]==F
            assert data["synthetic_consent"] is True
            assert len(data["source_text"])>=30
            return reply(route,payload={
                "uc":"UC03","title":"Dịch tài liệu, hợp đồng",
                "mode":"ai_draft_not_verified",
                "source_hash":"a"*64,"source_anchors":[
                    {"id":"A1","preview":"Điều 1. Bên A bàn giao tài liệu"},
                    {"id":"A2","preview":"Điều 2. Thời hạn thanh toán"}],
                "answer":"[A1] Article 1. Party A shall deliver the documents.",
                "review_notice":"Bản nháp QA, luật sư phải kiểm duyệt.",
                "translation_check":{"status":"review_required",
                  "missing_numbers":["10"],"missing_article_numbers":["2"]},
                "source_coverage":{"status":"review_required",
                  "source_segment_count":2,"marked_segment_count":1,
                  "missing_source_count":1,"missing_source_ids":["A2"],
                  "review_required":True}
            })
        if u=="/api/qa/drive/status":
            return reply(route,503,{"error":"paused"})
        if u=="/api/qa/matters" and method=="GET":
            return reply(route,payload={"matters":[as_row(c) for c in cases if not c.get("hidden",False)]})
        if u=="/api/qa/matters" and method=="POST":
            data=json.loads(req.post_data)
            assert "title" in data and "details" in data
            assert data["details"]["category"] in ("Dân sự","Lao động")
            mid=I if not cases else F
            cases.append(dict(id=mid,title=data["title"],title_version=1,version=1,details=data["details"]))
            files[mid]=[]
            return reply(route,201,{"id":mid,"title":data["title"],"created_at":1800000000,
                "details_saved":True,"details_version":1})
        for c in cases:
            path="/api/qa/cases/"+c["id"]
            if u==path and method=="GET":
                return reply(route,payload={"case":{
                    **c["details"],"title":c["title"],"title_version":c["title_version"],
                    "version":c["version"],"created_at":1800000000},
                    "members":[{"id":U,"label":"Luật sư QA"}],"can_write":True})
            if u==path and method=="PATCH":
                data=json.loads(req.post_data)
                assert data["expected_version"]==c["version"]
                c["version"]+=1
                c["details"]={k:v for k,v in data.items() if k!="expected_version"}
                return reply(route,payload={"id":c["id"],"version":c["version"],"saved":True})
            if u==path+"/files" and method=="GET":
                return reply(route,payload={"files":[f for f in files[c["id"]] if not f.get("hidden")]})
            if u==path+"/files" and method=="POST":
                body=req.post_data_buffer
                assert body.startswith(b"%PDF-")
                assert body[-5:].endswith(b"%%EOF")
                digest=hashlib.sha256(body).hexdigest()
                file=dict(id=str(uuid.uuid5(uuid.NAMESPACE_DNS,c["id"]+":"+str(len(files[c["id"]])))),
                    name=req.headers.get("x-file-name","QA%20evidence.pdf").replace("%20"," "),
                    mime_type="application/pdf",bytes=len(body),
                    sha256=digest,created_at=1800000000)
                files[c["id"]].append(file)
                return reply(route,201,file)
            for f in files[c["id"]]:
                if u==path+"/files/"+f["id"]+"/download" and method=="GET":
                    if f.get("hidden"):return reply(route,404,{"error":"hidden"})
                    data=b"%PDF-1.4\nSynthetic QA document only\n%%EOF"
                    return route.fulfill(status=200,content_type="application/pdf",body=data,
                        headers={"Content-Length":str(len(data))})
                if u==path+"/files/"+f["id"] and method=="PATCH":
                    assert json.loads(req.post_data)=={"action":"hide"}
                    if f.get("hidden"):return reply(route,404,{"error":"hidden"})
                    f["hidden"]=True
                    return reply(route,payload={"id":f["id"],"hidden":True,"physical_deleted":False})
            if u==path+"/events":
                if "before_at=" in req.url:
                    assert "before_id=qa-030" in req.url
                    return reply(route,payload={"events":[
                        {"id":"qa-old-1","action":"legacy_details_saved",
                         "actor_name":"QA trước đây","created_at":1799999000,
                         "changes":{"legacy":1}},
                        {"id":"qa-old-2","action":"file_hidden",
                         "actor_name":"Luật sư QA","created_at":1799998999,
                         "changes":{"name":"QA evidence.pdf"}}
                    ],"next_cursor":None})
                events=[
                    {"id":"qa-001","action":"details_updated","actor_name":"Luật sư QA",
                     "created_at":1800000000,
                     "changes":{"summary":{"from":"Bản cũ","to":"Bản mới"},
                                "priority":{"from":"normal","to":"high"}}},
                    {"id":"qa-002","action":"file_uploaded","actor_name":"Luật sư QA",
                     "created_at":1799999999,
                     "changes":{"name":"QA evidence.pdf","bytes":43}}
                ]
                events.extend({
                    "id":f"qa-{i:03d}","action":"file_downloaded",
                    "actor_name":"Luật sư QA","created_at":1799999900-i,
                    "changes":{"name":"QA evidence.pdf","bytes":43}
                } for i in range(3,31))
                return reply(route,payload={"events":events,
                    "next_cursor":{"at":1799999050,"id":"qa-030"}})
            if u=="/api/qa/matters/"+c["id"] and method=="PATCH":
                v=json.loads(req.post_data)
                if v.get("action")=="hide":
                    assert v["expected_version"]==c["title_version"]
                    c["hidden"]=True
                    return reply(route,payload={"id":c["id"],"hidden":True,"physical_deleted":False})
                c["title_version"]+=1;c["title"]=v["title"]
                return reply(route,payload={"id":c["id"],"title":c["title"],"version":c["title_version"]})
        return reply(route,404,{"error":"synthetic unavailable"})
    context=browser.new_context(viewport=viewport,accept_downloads=True)
    page=context.new_page()
    errors=[]
    page.on("pageerror",lambda e:errors.append(str(e)))
    page.route("**/api/qa/**",intercepted)
    page.goto(origin+"/#documents",wait_until="domcontentloaded")
    if name=="mobile":
        # User requirement: no create form before tapping "Tạo mới".
        page.locator(".qa-case-saved-list").wait_for(state="visible",timeout=15000)
        assert not page.locator("#matter-form").is_visible(),"mobile starts list-first"
        assert page.locator("#upload-btn").is_visible()
        page.locator("#upload-btn").click()
        page.locator("#matter-form").wait_for(state="visible")
        assert not page.locator("#matter-list").is_visible()
    page.locator("#matter-title").fill("Hồ sơ QA mẫu A")
    page.locator('[name="reference"]').fill("QA-LD-001")
    page.locator('[name="category"]').fill("Lao động")
    page.locator('[name="summary"]').fill("Vụ việc thử nghiệm, không có thông tin thật")
    page.locator("#case-r2-file").set_input_files({
        "name":"QA evidence.pdf","mimeType":"application/pdf",
        "buffer":b"%PDF-1.4\nSynthetic QA document only\n%%EOF"
    })
    page.locator("#matter-create").click()
    page.get_by_text("Đã lưu hồ sơ và 1 tệp vào R2 thành công.").wait_for(timeout=15000)
    assert len(cases)==1 and len(files[I])==1,(cases,files)
    # R125: accessible, expandable per-field history with actor/time; legacy
    # entries must be explicit about missing before/after metadata.
    page.locator("#case-history-details").evaluate("(e)=>e.open=true")
    page.locator("#case-history-list .case-history-entry").first.wait_for(state="visible",timeout=15000)
    assert page.locator("#case-history-list .case-history-entry").count()==30
    more=page.locator("#case-history-more")
    assert more.is_visible() and more.is_enabled()
    assert more.inner_text()=="Xem thêm lịch sử"
    first_audit=page.locator("#case-history-list .case-history-entry").first
    assert "Cập nhật thông tin" in first_audit.locator("summary").inner_text()
    assert "Luật sư QA" in first_audit.locator("summary").inner_text()
    first_audit.locator("summary").click()
    assert "Tóm tắt: Bản cũ → Bản mới" in first_audit.inner_text()
    assert "Mức ưu tiên: Bình thường → Cao" in first_audit.inner_text()
    history_list=page.locator("#case-history-list")
    history_list.evaluate("(el)=>el.scrollTop=90")
    more.click()
    page.locator("#case-history-list .case-history-entry").nth(31).wait_for(state="attached",timeout=15000)
    assert page.locator("#case-history-list .case-history-entry").count()==32
    assert not more.is_visible(), "last page should have no load-more action"
    assert history_list.evaluate("(el)=>el.scrollTop")>0, "append retains independent scroll"
    page.locator("#case-history-list .case-history-entry").nth(30).locator("summary").click()
    assert "không thể tái tạo chính xác" in page.locator("#case-history-list").inner_text()
    page.locator("#case-history-details").evaluate("(e)=>e.open=false")

    # R123: a PDF is recognized by its red document-shaped icon, not text alone.
    pdf_icon=page.locator("#case-r2-list .case-file-type-icon--pdf")
    assert pdf_icon.count()==1
    assert pdf_icon.first.get_attribute("role")=="img"
    assert pdf_icon.first.get_attribute("aria-label")=="Tệp PDF"
    assert pdf_icon.first.locator("svg path").count()==2
    assert pdf_icon.first.locator("svg text").text_content()=="PDF"
    first_row=page.locator("#case-r2-list .case-file-row").first.bounding_box()
    assert first_row and first_row["height"]<=108,(name,first_row)
    details=page.locator("#case-r2-details")
    assert details.get_attribute("open") is not None, "attached documents start expanded"
    assert page.locator("#case-r2-summary-count").inner_text()=="1 tệp"
    assert page.locator("#case-r2-list").is_visible()
    details.locator("summary").click()
    assert details.get_attribute("open") is None, "collapse should work"
    assert not page.locator("#case-r2-list").is_visible()
    assert page.locator("#case-r2-summary-count").is_visible(), "count must remain visible while collapsed"
    details.locator("summary").click()
    assert details.get_attribute("open") is not None
    assert page.locator("#case-r2-list").is_visible()
    assert page.locator("#case-r2-list .case-file-download").is_enabled(), "download must remain usable after saving on mobile"
    with page.expect_download(timeout=15000) as dl:
        page.locator("#case-r2-list .case-file-download").click()
    assert dl.value.suggested_filename=="QA evidence.pdf",dl.value.suggested_filename
    page.get_by_text("Tải tệp thành công, đã đối chiếu SHA-256.").wait_for(timeout=15000)
    # R122: user can choose 2 files together, then add another one before one Save.
    if name=="mobile":page.locator("#case-mobile-edit").click()
    docs=[
        {"name":"QA evidence B.pdf","mimeType":"application/pdf",
         "buffer":b"%PDF-1.4\nSynthetic QA document only\n%%EOF"},
        {"name":"QA evidence C.pdf","mimeType":"application/pdf",
         "buffer":b"%PDF-1.4\nSynthetic QA document only\n%%EOF"}
    ]
    page.locator("#case-r2-file").set_input_files(docs)
    assert page.locator("#case-selected-files .case-pending-row").count()==2
    page.locator("#case-r2-file").set_input_files({
      "name":"QA evidence D.pdf","mimeType":"application/pdf",
      "buffer":b"%PDF-1.4\nSynthetic QA document only\n%%EOF"})
    assert page.locator("#case-selected-files .case-pending-row").count()==3
    page.locator("#matter-create").click()
    page.get_by_text("Đã lưu hồ sơ và 3 tệp vào R2 thành công.").wait_for(timeout=15000)
    assert len(files[I])==4,(name,files[I])
    assert page.locator("#case-r2-list .case-file-download").count()==4
    assert page.locator("#case-r2-list .case-file-download").first.is_enabled()
    if name=="mobile":page.locator("#case-mobile-edit").click()
    page.locator("#case-r2-list .case-file-hide").first.click()
    page.locator("#case-r2-list .case-file-confirm-yes").click()
    page.get_by_text("Đã ẩn tệp khỏi danh sách; dữ liệu gốc vẫn còn trên R2.").wait_for(timeout=15000)
    assert len(files[I])==4 and sum(bool(f.get("hidden")) for f in files[I])==1
    assert page.locator("#case-r2-list .case-file-download").count()==3
    if name=="mobile":
        page.locator("#case-close").click()
        page.locator("#matter-list .case-action--view").first.click()
        page.locator("#matter-workspace[data-mobile-mode='detail']").wait_for(state="visible")
    assert cases[0]["details"]["reference"]=="QA-LD-001"
    assert page.locator("#matter-list .matter-row").count()==1
    # File list reload is async after reopening a case on mobile.
    page.wait_for_function("document.querySelectorAll('#case-r2-list .case-file-download').length === 3",timeout=15000)
    assert page.locator("#case-r2-list .matter-row").count()==3
    assert sum(1 for method,path in calls if method=="POST" and path=="/api/qa/matters")==1
    assert sum(1 for method,path in calls if method=="POST" and path.endswith("/files"))==4
    if name=="mobile":
        assert page.locator("#matter-workspace").get_attribute("data-mobile-mode")=="detail"
        assert page.locator("#case-mobile-edit").is_visible()
        assert not page.locator("#matter-list").is_visible()
        # R121: back/edit are compact pills, not stretched 50%-width cards.
        back=page.locator("#case-close")
        edit=page.locator("#case-mobile-edit")
        assert back.inner_text()=="← Danh sách",back.inner_text()
        assert edit.inner_text()=="Sửa",edit.inner_text()
        back_box,edit_box=back.bounding_box(),edit.bounding_box()
        assert back_box and edit_box
        assert 31<=back_box["height"]<=40 and 31<=edit_box["height"]<=40,(back_box,edit_box)
        assert back_box["width"]<=125 and edit_box["width"]<=90,(back_box,edit_box)
        assert abs(back_box["y"]-edit_box["y"])<=4,(back_box,edit_box)
        assert back.evaluate("(e)=>getComputedStyle(e).whiteSpace")=="nowrap"
        assert back.evaluate("(e)=>getComputedStyle(e).flexGrow")=="0"
    page.locator("#case-close").click()
    if name=="mobile":
        page.locator("#matter-list").wait_for(state="visible")
        assert not page.locator("#matter-form").is_visible()
        page.locator("#upload-btn").click()
    page.locator("#matter-title").fill("Hồ sơ QA mẫu B")
    page.locator('[name="category"]').fill("Dân sự")
    page.locator("#matter-create").click()
    page.get_by_text("Đã lưu hồ sơ thành công.").wait_for(timeout=15000)
    assert len(cases)==2
    if name=="mobile":
        page.locator("#case-close").click()
        page.locator("#matter-list").wait_for(state="visible")
    page.locator("#matter-category-filter").select_option("Lao động")
    assert page.locator("#matter-list .matter-row").count()==1
    assert page.locator("#matter-list .case-action").count()==3
    assert page.locator("#matter-list .case-action--view").is_visible()
    assert page.locator("#matter-list .case-action--edit").is_visible()
    assert page.locator("#matter-list .case-action--hide").is_visible()
    if name=="mobile":
        # R120: compact visual footprint; three separate actions remain readable.
        heights=[page.locator("#matter-list .case-action--"+kind).bounding_box()["height"]
                 for kind in ("view","edit","hide")]
        widths=[page.locator("#matter-list .case-action--"+kind).bounding_box()["width"]
                for kind in ("view","edit","hide")]
        refresh=page.locator("#matter-refresh").bounding_box()
        create=page.locator("#upload-btn").bounding_box()
        assert all(34 <= h <= 40 for h in heights),(heights,widths)
        assert all(42 <= w <= 84 for w in widths),(heights,widths)
        assert refresh and 33 <= refresh["height"] <= 40,refresh
        assert refresh["width"] <= 95,refresh
        assert create and create["height"] <= 42,create
        assert page.locator("#matter-list .case-row-actions").evaluate(
            "(node) => node.scrollWidth <= node.clientWidth+1")
    page.locator("#matter-list .case-action--view").click()
    page.get_by_text("Đã mở hồ sơ. Chỉnh sửa hoặc chọn thêm tệp rồi bấm “Lưu thay đổi”.").wait_for(timeout=15000)
    if name=="mobile":
        assert page.locator("#matter-workspace").get_attribute("data-mobile-mode")=="detail"
        assert not page.locator('[name="summary"]').is_enabled()
        assert not page.locator("#matter-list").is_visible()
        page.locator("#case-mobile-edit").click()
        assert page.locator("#matter-workspace").get_attribute("data-mobile-mode")=="edit"
    assert page.locator("#matter-create").inner_text()=="Lưu thay đổi"
    page.locator('[name="summary"]').fill("Nội dung QA đã cập nhật")
    page.locator("#matter-create").click()
    page.get_by_text("Đã lưu hồ sơ thành công.").wait_for(timeout=15000)
    assert ("PATCH","/api/qa/cases/"+I) in calls,calls
    assert cases[0]["details"]["summary"]=="Nội dung QA đã cập nhật"
    assert page.locator("#case-r2-list .matter-row").count()==3
    if name=="mobile":
        page.locator("#case-close").click()
        assert page.locator("#matter-list").is_visible()
        assert not page.locator("#matter-form").is_visible()
    # R119: an ordinary user can only hide (no physical DELETE).
    page.locator("#matter-list .case-action--hide").click()
    panel=page.locator("#matter-list .case-hide-confirm")
    panel.wait_for(state="visible")
    assert "giữ nguyên" in panel.inner_text()
    page.locator("#matter-list .case-hide-cancel").click()
    assert len(cases)==2 and not cases[0].get("hidden",False)
    page.locator("#matter-list .case-action--hide").click()
    page.locator("#matter-list .case-hide-approve").click()
    page.get_by_text("Đã ẩn hồ sơ khỏi danh sách. Dữ liệu và tài liệu vẫn được giữ nguyên.").wait_for(timeout=15000)
    assert cases[0]["hidden"] is True
    assert len(cases)==2 and len(files[I])==4
    # Once the hidden practice area disappears, the filter resets to All.
    # Other live cases remain visible; the hidden case does not.
    assert page.locator("#matter-list .matter-row").count()==1
    assert "Hồ sơ QA mẫu B" in page.locator("#matter-list").inner_text()
    assert "Hồ sơ QA mẫu A" not in page.locator("#matter-list").inner_text()
    assert sum(1 for method,path in calls if method=="DELETE" and "/api/qa/matters/" in path)==0
    # Word recognition from stored file metadata; no actual DOCX bytes sent.
    files[F].append(dict(id=str(uuid.uuid4()),name="QA example Word.docx",
        mime_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        bytes=2311,sha256="a"*64,created_at=1800000000))
    page.locator("#matter-list .case-action--view").click()
    word=page.locator("#case-r2-list .case-file-type-icon--word")
    word.wait_for(state="visible",timeout=15000)
    assert word.get_attribute("aria-label")=="Tài liệu Word"
    assert word.locator("svg text").text_content()=="W"
    assert page.locator("#case-r2-list .case-file-name").inner_text()=="QA example Word.docx"
    word_row=page.locator("#case-r2-list .case-file-row").first.bounding_box()
    assert word_row and word_row["height"]<=108,(name,word_row)
    assert page.locator("#case-r2-list .case-file-download").is_enabled()
    # R124: long file lists scroll INSIDE their viewport, while the summary and
    # action controls remain compact. Use cloned synthetic rows (no network).
    scroll_state=page.locator("#case-r2-list").evaluate("""el => {
      const template=el.querySelector('.case-file-row');
      for(let i=0;i<16;i++)el.append(template.cloneNode(true));
      const overflow=getComputedStyle(el).overflowY;
      const capped=el.scrollHeight>el.clientHeight;
      el.scrollTop=el.scrollHeight;
      return {overflow,capped,scrollTop:el.scrollTop,height:el.clientHeight};
    }""")
    assert scroll_state["overflow"]=="auto" and scroll_state["capped"],(name,scroll_state)
    assert scroll_state["scrollTop"]>0 and scroll_state["height"]<=342,(name,scroll_state)
    history=page.locator("#case-history-details")
    assert history.is_visible()
    assert history.get_attribute("open") is None
    history.locator(":scope > summary").click()
    assert history.get_attribute("open") is not None
    history_scroll=page.locator("#case-history-list").evaluate("""el => {
      for(let i=0;i<16;i++){
        const p=document.createElement('p');p.textContent='Sự kiện QA '+i;el.append(p);
      }
      el.scrollTop=el.scrollHeight;
      return {overflow:getComputedStyle(el).overflowY,capped:el.scrollHeight>el.clientHeight,scrollTop:el.scrollTop};
    }""")
    assert history_scroll["overflow"]=="auto" and history_scroll["capped"] and history_scroll["scrollTop"]>0,(name,history_scroll)
    history.locator(":scope > summary").click()
    assert history.get_attribute("open") is None
    width=page.evaluate("document.documentElement.scrollWidth")
    assert width<=viewport["width"]+4,(name,width,viewport)
    # R127 UC03: real Chromium DOM, synthetic authorized QA AI response only.
    # Missing source A2 must remain a visible non-authoritative warning.
    page.goto(origin+"/#uc-UC03",wait_until="domcontentloaded")
    page.locator("#legal-qa-form").wait_for(state="visible",timeout=15000)
    page.locator("#legal-qa-example").click()
    page.locator("#legal-qa-matter").select_option(F)
    page.locator("#legal-qa-consent").check()
    page.locator("#legal-qa-run").click()
    coverage=page.locator("#legal-qa-source-coverage")
    coverage.wait_for(state="visible",timeout=15000)
    assert "1/2" in coverage.inner_text()
    assert "A2" in coverage.inner_text()
    assert "không chứng minh" in coverage.inner_text()
    assert page.locator("#legal-qa-translation-check").is_visible()
    assert page.locator("#legal-qa-output").inner_text().startswith("[A1] Article 1")
    assert page.locator("#legal-qa-result").is_visible()
    # Switching UCs must clear all previous answer, source evidence and flags.
    page.goto(origin+"/#uc-UC04",wait_until="domcontentloaded")
    page.wait_for_function("""() => document.querySelector('#legal-qa-source-coverage')?.hidden === true
       && document.querySelector('#legal-qa-output')?.textContent === ''""",timeout=15000)
    assert not page.locator("#legal-qa-result").is_visible()
    # R128: synthetic UC04 summary warning is a bounded, human-review-only UI
    # with original draft retained and no UC03 warning bleed-through.
    page.locator("#legal-qa-example").click()
    page.locator("#legal-qa-matter").select_option(F)
    page.locator("#legal-qa-consent").check()
    page.locator("#legal-qa-run").click()
    check=page.locator("#legal-qa-summary-review")
    check.wait_for(state="visible",timeout=15000)
    assert check.get_attribute("data-state")=="warning"
    assert check.evaluate("(e)=>e.tagName")=="DETAILS"
    assert "Cần đối chiếu" in check.locator(":scope > summary").inner_text()
    inputs=page.locator("#legal-qa-input-details")
    assert inputs.evaluate("(e)=>e.tagName")=="DETAILS"
    if name=="mobile":
        assert not inputs.evaluate("(e)=>e.open"),"UC04 inputs should auto-collapse on successful small-screen summary"
        assert not check.evaluate("(e)=>e.open"),"Mobile warnings should default collapsed with visible summary"
        page.wait_for_function("""() => {
          const r=document.querySelector('#legal-qa-result').getBoundingClientRect();
          return r.top >= -10 && r.top < window.innerHeight*0.6;
        }""",timeout=10000)
        assert page.locator("#legal-qa-example").is_hidden(),"Collapsed form must stay out of the viewport"
        inputs.locator(":scope > summary").click()
        assert inputs.evaluate("(e)=>e.open"),"Users must be able to reopen inputs"
        assert page.locator("#legal-qa-example").is_visible()
        input_row=page.locator("#legal-qa-example").bounding_box()
        run_row=page.locator("#legal-qa-run").bounding_box()
        assert input_row and run_row and abs(input_row["y"]-run_row["y"])<=4,"UC04 buttons should share a compact row"
        assert input_row["height"]>=40 and run_row["height"]>=40
        inputs.locator(":scope > summary").click()
        assert not inputs.evaluate("(e)=>e.open")
    else:
        assert inputs.evaluate("(e)=>e.open"),"Desktop keeps the existing visible form"
        assert check.evaluate("(e)=>e.open"),"Desktop initially expands the warning"
    if not check.evaluate("(e)=>e.open"):
        check.locator(":scope > summary").click()
    assert "1/2" in check.inner_text()
    assert "A2" in check.inner_text()
    assert "10" in check.inner_text()
    assert "20/9/2026" in check.inner_text()
    assert "không" in check.inner_text().lower()
    check.locator(":scope > summary").click()
    assert not check.evaluate("(e)=>e.open"),"Warning must support collapse"
    check.locator(":scope > summary").click()
    assert check.evaluate("(e)=>e.open"),"Warning must support reopen"
    assert not page.locator("#legal-qa-source-coverage").is_visible()
    assert page.locator("#legal-qa-output").inner_text().startswith("[A1] Bên A")
    mobile_width=page.evaluate("document.documentElement.scrollWidth")
    assert mobile_width<=viewport["width"]+4,(name,mobile_width,viewport)
    page.goto(origin+"/#uc-UC07",wait_until="domcontentloaded")
    page.wait_for_function("""() => document.querySelector('#legal-qa-summary-review')?.hidden === true
      && document.querySelector('#legal-qa-output')?.textContent === ''""",timeout=15000)
    assert not page.locator("#legal-qa-result").is_visible()
    assert not errors,(name,errors)
    print(f"PASS {name}: one create/save, D1 details, PDF upload, two-category filter, edit/reload, no overflow")
    context.close()

def main():
    server=ThreadingHTTPServer(("127.0.0.1",0),Quiet)
    runner=threading.Thread(target=server.serve_forever,daemon=True)
    runner.start()
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True)
            try:
                origin=f"http://127.0.0.1:{server.server_address[1]}"
                scenario(browser,"desktop",{"width":1280,"height":850},origin)
                scenario(browser,"mobile",{"width":390,"height":844},origin)
            finally:browser.close()
    finally:server.shutdown();server.server_close()

if __name__=="__main__":main()
