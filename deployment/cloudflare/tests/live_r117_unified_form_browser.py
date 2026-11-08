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
    qa_import_pdf=b"%PDF-1.4\\nSynthetic QA only Article 1 Party A delivers 10 documents.\\n%%EOF"
    qa_import_docx=b"PK\\x03\\x04Synthetic QA DOCX sample bytes (converter mocked by test)"
    qa_import_files={"qa_r138.pdf":qa_import_pdf,"qa_r138.docx":qa_import_docx,
                     "qa_r139_badsha.pdf":qa_import_pdf}
    qa_import_text="Điều 1. Bên A giao 10 tài liệu vào ngày 15/09/2026. Bên B thanh toán 2.000.000 đồng."
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
        # R138: synthetic real multipart upload bytes, never a real converter
        # or customer file. Separate backend test verifies ACL and toMarkdown.
        if u=="/api/qa/legal/extract" and method=="POST":
            body=req.post_data_buffer
            file_name=next((n for n in qa_import_files if n.encode() in body),None)
            assert file_name is not None
            assert b"synthetic_consent" in body and b"true" in body
            assert F.encode() in body and b"UC03" in body
            assert qa_import_files[file_name] in body
            return reply(route,payload={
                "uc":"UC03","file_name":file_name,
                "file_size":len(qa_import_files[file_name]),
                "file_type":"pdf" if file_name.endswith(".pdf") else "docx",
                "source_sha256":("0"*64 if file_name=="qa_r139_badsha.pdf" else
                                 hashlib.sha256(qa_import_files[file_name]).hexdigest()),
                "source_text":qa_import_text,
                "mode":"qa_file_text_preview_not_verified",
                "review_required":True,"storage":"none",
                "note":"Synthetic text conversion for review; no storage."})
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
            if data["uc"]=="UC07":
                assert data["matter_id"]==F
                assert data["synthetic_consent"] is True
                if "CẤU TRÚC KHÔNG HỢP LỆ" in data["source_text"]:
                    return reply(route,payload={
                        "uc":"UC07","title":"Sửa lỗi ngữ pháp",
                        "mode":"ai_draft_not_verified","source_hash":"a"*64,
                        "source_anchors":[{"id":"A1","preview":"Nguồn QA lỗi định dạng"}],
                        "answer":"Bên B được thanh toán 3 triệu nhưng không có bản sửa tách riêng.",
                        "grammar_edited_text":None,
                        "review_notice":"Bản nháp cần kiểm tra thủ công.",
                        "grammar_review":{"status":"manual_review_no_proposed_version",
                            "isolated_proposal":False,
                            "number_changed_count":0,"date_changed_count":0,
                            "duty_changed_count":0,"party_changed_count":0,
                            "number_changes":[],"date_changes":[],
                            "duty_changes":[],"party_changes":[],
                            "review_required":True}
                    })
                return reply(route,payload={
                    "uc":"UC07","title":"Sửa lỗi ngữ pháp",
                    "mode":"ai_draft_not_verified","source_hash":"a"*64,
                    "source_anchors":[{"id":"A1","preview":"Bên A phải thanh toán"}],
                    "answer":"[BẮT ĐẦU BẢN SỬA]\\nBên B có thể thanh toán 3.000.000 đồng vào ngày 16/09/2026.\\n[KẾT THÚC BẢN SỬA]\\nDanh sách chỉnh sửa cần rà soát.",
                    "grammar_edited_text":"Bên B có thể thanh toán 3.000.000 đồng vào ngày 16/09/2026.",
                    "review_notice":"Bản sửa chỉ là đề xuất QA.",
                    "grammar_review":{
                        "status":"review_required","isolated_proposal":True,
                        "number_changed_count":2,
                        "number_changes":[
                            {"value":"2000000","from_count":1,"to_count":0},
                            {"value":"3000000","from_count":0,"to_count":1}],
                        "date_changed_count":2,
                        "date_changes":[
                            {"value":"15/9/2026","from_count":1,"to_count":0},
                            {"value":"16/9/2026","from_count":0,"to_count":1}],
                        "duty_changed_count":1,
                        "duty_changes":[{"value":"phải","from_count":1,"to_count":0}],
                        "party_changed_count":2,
                        "party_changes":[
                            {"value":"bên a","from_count":1,"to_count":0},
                            {"value":"bên b","from_count":0,"to_count":1}],
                        "review_required":True}
                })
            assert data["uc"]=="UC03"
            assert data["matter_id"]==F
            assert data["synthetic_consent"] is True
            assert len(data["source_text"])>=30
            # R136: synthetic provider response to exercise user-facing
            # warnings; no live model or customer document is used.
            if "R136-REVERSE" in data["source_text"] or "R136-EMPTY" in data["source_text"]:
                reverse="R136-REVERSE" in data["source_text"]
                return reply(route,payload={
                    "uc":"UC03","title":"Dịch tài liệu, hợp đồng",
                    "mode":"ai_draft_not_verified",
                    "source_hash":"a"*64,"source_anchors":[
                        {"id":"A1","preview":"Nguồn hư cấu thứ nhất"},
                        {"id":"A2","preview":"Nguồn hư cấu thứ hai"}],
                    "answer":("[A2] Article 2. Payment.\\n[A1] Article 1. Delivery."
                              if reverse else "[A1] \\n[A2] Article 2. Payment."),
                    "review_notice":"Văn bản mẫu, cần đối chiếu.",
                    "translation_check":{"status":"review_required",
                      "missing_numbers":["10"],"missing_article_numbers":[]},
                    "source_coverage":{
                        "status":"review_required",
                        "source_segment_count":2,
                        "marked_segment_count":2 if reverse else 1,
                        "missing_source_count":0 if reverse else 1,
                        "missing_source_ids":[] if reverse else ["A1"],
                        "misplaced_source_ids":[],
                        "duplicate_source_ids":[],
                        "empty_source_ids":[] if reverse else ["A1"],
                        "out_of_order_source_ids":["A2","A1"] if reverse else [],
                        "review_required":True}
                })
            return reply(route,payload={
                "uc":"UC03","title":"Dịch tài liệu, hợp đồng",
                "mode":"ai_draft_not_verified",
                "source_hash":"a"*64,"source_anchors":[
                    {"id":"A1","preview":"Điều 1. Bên A bàn giao tài liệu"},
                    {"id":"A2","preview":"Điều 2. Thời hạn thanh toán"}],
                "answer":"[A1] Article 1. Party A shall deliver the documents.\\nNote: the untranslated source [A2] mentions payment.",
                "review_notice":"Bản nháp QA, luật sư phải kiểm duyệt.",
                "translation_check":{"status":"review_required",
                  "missing_numbers":["10"],"missing_article_numbers":["2"]},
                "source_coverage":{"status":"review_required",
                  "source_segment_count":2,"marked_segment_count":1,
                  "missing_source_count":1,"missing_source_ids":["A2"],
                  "misplaced_source_ids":["A2"],"duplicate_source_ids":[],
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
        # Snapshot both boxes in one browser task. Two serial Playwright
        # bounding_box() calls can see different frames during smooth scrolling,
        # spuriously reporting a 6px offset for truly aligned sibling buttons.
        back_box,edit_box=page.evaluate("""() => {
            return ['case-close', 'case-mobile-edit'].map(id => {
                const r=document.getElementById(id).getBoundingClientRect();
                return {x:r.x, y:r.y, width:r.width, height:r.height};
            });
        }""")
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
    # R138: in-memory PDF/DOCX import is deliberately separate from UC03 AI.
    # Both inputs are real multipart browser file bytes, response is synthetic.
    source=page.locator("#legal-qa-source")
    file_details=page.locator("#legal-qa-file-details")
    file_input=page.locator("#legal-qa-file-input")
    file_status=page.locator("#legal-qa-file-status")
    file_review=page.locator("#legal-qa-file-reviewed")
    file_use=page.locator("#legal-qa-file-use")
    assert file_details.is_visible()
    assert not file_details.evaluate("(e)=>e.open"),"File chooser must start collapsed"
    file_details.locator(":scope > summary").click()
    page.locator("#legal-qa-matter").select_option(F)
    for filename,mime,blob in [
       ("qa_r138.pdf","application/pdf",qa_import_pdf),
       ("qa_r138.docx","application/vnd.openxmlformats-officedocument.wordprocessingml.document",qa_import_docx)
    ]:
        file_input.set_input_files({"name":filename,"mimeType":mime,"buffer":blob})
        assert not page.locator("#legal-qa-file-consent").is_checked()
        if filename.endswith(".pdf"):
            before=len([c for c in calls if c==("POST","/api/qa/legal/extract")])
            page.locator("#legal-qa-file-extract").click()
            assert "Chọn tệp" in file_status.inner_text()
            assert len([c for c in calls if c==("POST","/api/qa/legal/extract")])==before
        page.locator("#legal-qa-file-consent").check()
        run_before=len([c for c in calls if c==("POST","/api/qa/legal/run")])
        source_before=source.input_value()
        page.locator("#legal-qa-file-extract").click()
        page.locator("#legal-qa-file-preview").wait_for(state="visible",timeout=15000)
        assert qa_import_text in page.locator("#legal-qa-file-text").inner_text()
        assert not file_use.is_enabled()
        assert "chưa" not in file_status.inner_text().lower() or "lưu" not in file_status.inner_text().lower()
        assert len([c for c in calls if c==("POST","/api/qa/legal/run")])==run_before
        assert source.input_value()==source_before,"Preview must NOT auto-overwrite source"
        file_review.check()
        assert file_use.is_enabled()
        file_use.click()
        assert source.input_value()==qa_import_text
        assert not page.locator("#legal-qa-consent").is_checked()
        assert page.locator("#legal-qa-file-preview").is_hidden()
        assert file_input.input_value()==""
    # R139: UI must independently calculate SHA-256 from the selected File,
    # not trust server-side checksum formatting or display alone. A forged but
    # correctly shaped digest cannot permit a preview/import or model call.
    run_before=len([c for c in calls if c==("POST","/api/qa/legal/run")])
    source_before=source.input_value()
    file_input.set_input_files({"name":"qa_r139_badsha.pdf",
        "mimeType":"application/pdf","buffer":qa_import_pdf})
    page.locator("#legal-qa-file-consent").check()
    page.locator("#legal-qa-file-extract").click()
    page.wait_for_function("""() =>
       document.getElementById('legal-qa-file-status').dataset.state==='error'""")
    assert "SHA-256" in file_status.inner_text()
    assert page.locator("#legal-qa-file-extract").is_enabled()
    assert page.locator("#legal-qa-file-preview").is_hidden()
    assert not file_use.is_enabled()
    assert source.input_value()==source_before
    assert len([c for c in calls if c==("POST","/api/qa/legal/run")])==run_before
    # R139: DOM values may change without an input event. Existing source A
    # must never be silently replaced by an already-reviewed file.
    file_input.set_input_files({"name":"qa_r138.pdf",
        "mimeType":"application/pdf","buffer":qa_import_pdf})
    page.locator("#legal-qa-file-consent").check()
    page.locator("#legal-qa-file-extract").click()
    page.locator("#legal-qa-file-preview").wait_for(state="visible",timeout=15000)
    file_review.check()
    assert file_use.is_enabled()
    injected_source="Nguồn A vừa được người khác sửa trong DOM mà không có input event."
    page.evaluate("""sourceValue => {
      document.getElementById('legal-qa-source').value=sourceValue;
    }""",injected_source)
    file_use.click()
    assert source.input_value()==injected_source
    assert page.locator("#legal-qa-file-preview").is_hidden()
    assert not file_use.is_enabled()
    assert "nguồn A" in file_status.inner_text()
    assert page.locator("#legal-qa-file-extract").is_enabled()
    assert len([c for c in calls if c==("POST","/api/qa/legal/run")])==run_before
    # Backend blocks oversize multipart and browser must refuse before fetch.
    file_input.set_input_files({"name":"huge_qa.pdf","mimeType":"application/pdf",
        "buffer":b"%PDF-"+b"z"*1500000})
    page.locator("#legal-qa-file-consent").check()
    previous=len([c for c in calls if c==("POST","/api/qa/legal/extract")])
    page.locator("#legal-qa-file-extract").click()
    assert "1,5 MB" in file_status.inner_text()
    assert len([c for c in calls if c==("POST","/api/qa/legal/extract")])==previous
    # Returning to text-only workflow should require fresh consent as before.
    page.locator("#legal-qa-example").click()
    page.locator("#legal-qa-matter").select_option(F)
    page.locator("#legal-qa-consent").check()
    page.locator("#legal-qa-run").click()
    coverage=page.locator("#legal-qa-source-coverage")
    coverage.wait_for(state="visible",timeout=15000)
    assert "1/2" in coverage.inner_text()
    assert "A2" in coverage.inner_text()
    assert "Nhãn chưa đứng đầu dòng dịch: A2" in coverage.inner_text()
    assert "không chứng minh" in coverage.inner_text()
    assert page.locator("#legal-qa-translation-check").is_visible()
    assert page.locator("#legal-qa-output").inner_text().startswith("[A1] Article 1")
    assert page.locator("#legal-qa-result").is_visible()
    # R137: UC03 must provide an in-session source/draft comparison. Raw
    # model output cannot be copied without deliberate human acknowledgment.
    review=page.locator("#legal-qa-uc03-04-compare")
    ack=page.locator("#legal-qa-uc03-04-reviewed")
    gated_copy=page.locator("#legal-qa-uc03-04-copy-reviewed")
    assert review.is_visible() and page.locator("#legal-qa-copy").is_hidden()
    assert not gated_copy.is_enabled() and not ack.is_checked()
    if not review.evaluate("(e)=>e.open"):
        review.locator(":scope > summary").click()
    assert "Điều 1." in page.locator("#legal-qa-uc03-04-original").inner_text()
    assert "Article 1." in page.locator("#legal-qa-uc03-04-draft").inner_text()
    ack.check()
    assert gated_copy.is_enabled(), "User acknowledgement alone enables current draft copy"
    # R134: UC03 cannot keep an old translation/evidence/copy shortcut after
    # changing the question, and must clear any draft when Matter is revoked.
    page.locator("#legal-qa-question").fill("Kiểm tra từ ngữ mới trong văn bản thử nghiệm")
    assert page.locator("#legal-qa-result").is_hidden(), "UC03 answer became stale"
    assert not page.locator("#legal-qa-output").inner_text()
    assert coverage.is_hidden()
    assert review.is_hidden() and not ack.is_checked()
    assert not gated_copy.is_enabled()
    page.locator("#legal-qa-run").click()
    coverage.wait_for(state="visible",timeout=15000)
    page.locator("#legal-qa-matter").select_option("")
    assert page.locator("#legal-qa-result").is_hidden(), "Matter switch must invalidate answer"
    assert not page.locator("#legal-qa-output").inner_text()
    # R134 fail-closed clipboard fallback: a script can modify a field without
    # dispatching input/change. Copy must still compare the original snapshot.
    page.locator("#legal-qa-matter").select_option(F)
    page.locator("#legal-qa-run").click()
    coverage.wait_for(state="visible",timeout=15000)
    review=page.locator("#legal-qa-uc03-04-compare")
    if not review.evaluate("(e)=>e.open"):
        review.locator(":scope > summary").click()
    page.locator("#legal-qa-uc03-04-reviewed").check()
    assert page.locator("#legal-qa-uc03-04-copy-reviewed").is_enabled()
    page.evaluate("""() => {
      document.getElementById('legal-qa-question').value =
        'Yêu cầu đổi bằng lập trình nhưng không gửi sự kiện input';
    }""")
    page.locator("#legal-qa-uc03-04-copy-reviewed").click()
    assert page.locator("#legal-qa-result").is_hidden(), "Silent edit must block UC03 reviewed copy"
    assert not page.locator("#legal-qa-output").inner_text()
    # Simulate a pending provider reply which arrives after the user edits input.
    page.locator("#legal-qa-matter").select_option(F)
    page.evaluate("""() => {
       const nativeFetch=window.fetch.bind(window);
       window.__qaReleaseStale=null;window.__qaDelayedOnce=false;
       window.fetch=(url, options) => {
         if(url==='/api/qa/legal/run'&&!window.__qaDelayedOnce){
           window.__qaDelayedOnce=true;
           return new Promise(resolve=>{
             window.__qaReleaseStale=()=>resolve(nativeFetch(url,options));
           });
         }
         return nativeFetch(url,options);
       };
    }""")
    page.locator("#legal-qa-run").click()
    page.wait_for_function("typeof window.__qaReleaseStale === 'function'")
    page.locator("#legal-qa-source").fill(
       "Điều 1. Bên A hoàn tất nghĩa vụ trước ngày 20/09/2026. "
       "Đây là dữ liệu hư cấu đã chỉnh trong khi phản hồi AI đang chờ.")
    assert page.locator("#legal-qa-run").is_enabled(), "Pending request should be canceled"
    page.evaluate("window.__qaReleaseStale()")
    page.wait_for_timeout(250)
    assert page.locator("#legal-qa-result").is_hidden(), "Late UC03 answer must be discarded"
    assert not page.locator("#legal-qa-output").inner_text()
    # R136: A full set of [A#] markers out of source order must still warn,
    # and an empty translated paragraph must not be counted as completed.
    for marker,expectedLabel,expectedCount in [
        ("R136-REVERSE","Thứ tự nhãn khác thứ tự nguồn (theo bản nháp): A2, A1","2/2"),
        ("R136-EMPTY","Nhãn không có nội dung dịch: A1","1/2")
    ]:
        page.locator("#legal-qa-source").fill(
            marker+" Điều 1. Bên A giao 10 tài liệu. Điều 2. Bên B thanh toán sau nghiệm thu.")
        page.locator("#legal-qa-run").click()
        coverage.wait_for(state="visible",timeout=15000)
        assert coverage.get_attribute("data-state")=="warning"
        assert expectedLabel in coverage.inner_text(),(name,marker,coverage.inner_text())
        assert expectedCount in coverage.inner_text()
        assert page.locator("#legal-qa-output").inner_text().startswith("[A")
        if marker=="R136-REVERSE":
            assert "Đoạn cần kiểm tra:" not in coverage.inner_text()
        page.locator("#legal-qa-source").fill("Nguồn hư cấu mới đã đổi để hủy bản nháp AI đang hiển thị.")
        assert coverage.is_hidden(),"Source change must clear marker warnings"
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
        # Snapshot both aligned buttons atomically during any smooth scroll:
        # serial bounding_box() reads can sample different animation frames.
        input_row,run_row=page.evaluate("""() => {
          return ['legal-qa-example', 'legal-qa-run'].map(id => {
            const r=document.getElementById(id).getBoundingClientRect();
            return {x:r.x,y:r.y,width:r.width,height:r.height};
          });
        }""")
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
    # R137: UC04 summary retains its collapsible mobile controls but requires
    # comparison of source/summary before any clipboard action is enabled.
    review=page.locator("#legal-qa-uc03-04-compare")
    ack=page.locator("#legal-qa-uc03-04-reviewed")
    gated_copy=page.locator("#legal-qa-uc03-04-copy-reviewed")
    assert review.is_visible()
    assert page.locator("#legal-qa-copy").is_hidden()
    assert not gated_copy.is_enabled()
    if not review.evaluate("(e)=>e.open"):
        review.locator(":scope > summary").click()
    assert "Điều 1." in page.locator("#legal-qa-uc03-04-original").inner_text()
    assert "Bên A" in page.locator("#legal-qa-uc03-04-draft").inner_text()
    ack.check()
    assert gated_copy.is_enabled()
    # Silent field mutation must deny copy EVEN when checkmark remains checked.
    page.evaluate("""() => {
      document.getElementById('legal-qa-question').value =
         'Dữ liệu khác sau khi xác nhận nhưng không phát sự kiện';
    }""")
    gated_copy.click()
    assert page.locator("#legal-qa-result").is_hidden()
    assert not ack.is_checked()
    assert not gated_copy.is_enabled()
    # Mobile UC04 auto-collapses the source form after success. Open it again
    # before the next explicit submit; do not click a hidden form button.
    if not inputs.evaluate("(e)=>e.open"):
        inputs.locator(":scope > summary").click()
    page.locator("#legal-qa-run").click()
    check.wait_for(state="visible",timeout=15000)
    review.wait_for(state="visible",timeout=15000)
    # R134: reopening collapsed UC04 form and editing a source invalidates
    # existing summary and its QA review flags, without changing other UCs.
    if not inputs.evaluate("(e)=>e.open"):
        inputs.locator(":scope > summary").click()
    page.locator("#legal-qa-source").fill(
        "Điều 1. Bên B thanh toán 5.000.000 đồng ngày 30/09/2026. "
        "Đây là văn bản thử nghiệm mới sau bản tóm tắt trước.")
    assert page.locator("#legal-qa-result").is_hidden(), "UC04 summary stale"
    assert page.locator("#legal-qa-summary-review").is_hidden()
    assert not page.locator("#legal-qa-output").inner_text()
    mobile_width=page.evaluate("document.documentElement.scrollWidth")
    assert mobile_width<=viewport["width"]+4,(name,mobile_width,viewport)
    page.goto(origin+"/#uc-UC07",wait_until="domcontentloaded")
    page.wait_for_function("""() => document.querySelector('#legal-qa-summary-review')?.hidden === true
      && document.querySelector('#legal-qa-output')?.textContent === ''""",timeout=15000)
    assert not page.locator("#legal-qa-result").is_visible()
    # R130 UC07 synthetic QA: warning is visible on both screen sizes,
    # collapsed by default on mobile; the original output text is unchanged.
    page.locator("#legal-qa-example").click()
    page.locator("#legal-qa-matter").select_option(F)
    page.locator("#legal-qa-consent").check()
    page.locator("#legal-qa-run").click()
    grammar=page.locator("#legal-qa-grammar-review")
    grammar.wait_for(state="visible",timeout=15000)
    assert grammar.get_attribute("data-state")=="warning"
    assert grammar.evaluate("(e)=>e.tagName")=="DETAILS"
    assert "Cần đối chiếu" in grammar.locator(":scope > summary").inner_text()
    assert grammar.evaluate("(e)=>e.open")==(name!="mobile")
    if not grammar.evaluate("(e)=>e.open"):
        grammar.locator(":scope > summary").click()
    assert "2000000" in grammar.inner_text()
    assert "16/9/2026" in grammar.inner_text()
    assert "nghĩa vụ" in grammar.inner_text().lower()
    assert "bên a" in grammar.inner_text().lower()
    assert "KHÔNG xác minh" in grammar.inner_text()
    assert page.locator("#legal-qa-output").inner_text().startswith("[BẮT ĐẦU BẢN SỬA]")
    assert not page.locator("#legal-qa-source-coverage").is_visible()
    assert not page.locator("#legal-qa-summary-review").is_visible()
    grammar.locator(":scope > summary").click()
    assert not grammar.evaluate("(e)=>e.open")
    grammar.locator(":scope > summary").click()
    assert grammar.evaluate("(e)=>e.open")
    assert page.evaluate("document.documentElement.scrollWidth")<=viewport["width"]+4
    # R131: UC07 shows independently scrollable source/proposal, never exposes
    # the raw model reply via clipboard. Reviewer acknowledgment is session-only.
    compare=page.locator("#legal-qa-uc07-compare")
    compare.wait_for(state="visible",timeout=15000)
    assert compare.evaluate("(el)=>el.tagName")=="DETAILS"
    assert compare.evaluate("(el)=>el.open")==(name!="mobile")
    assert page.locator("#legal-qa-copy").is_hidden()
    edited_copy=page.locator("#legal-qa-uc07-copy-edited")
    assert edited_copy.is_disabled()
    assert not page.locator("#legal-qa-uc07-reviewed").is_checked()
    if not compare.evaluate("(el)=>el.open"):
        compare.locator(":scope > summary").click()
    assert page.locator("#legal-qa-uc07-original").inner_text()==page.locator("#legal-qa-source").input_value().strip()
    assert page.locator("#legal-qa-uc07-edited").inner_text().startswith("Bên B có thể thanh toán")
    assert "Danh sách chỉnh sửa" not in page.locator("#legal-qa-uc07-edited").inner_text()
    assert edited_copy.is_disabled()
    page.evaluate("""() => {
        window.__uc07Copied = null;
        Object.defineProperty(navigator,'clipboard',{
          configurable:true,
          value:{writeText:(value)=>{window.__uc07Copied=value;return Promise.resolve();}}
        });
    }""")
    page.locator("#legal-qa-uc07-reviewed").check()
    assert edited_copy.is_enabled()
    edited_copy.click()
    page.wait_for_function("() => typeof window.__uc07Copied === 'string'")
    assert page.evaluate("window.__uc07Copied")=="Bên B có thể thanh toán 3.000.000 đồng vào ngày 16/09/2026."
    page.wait_for_function("""() => document.querySelector('#legal-qa-uc07-copy-status')
       ?.textContent.includes('chưa được phê duyệt pháp lý')""",timeout=15000)
    page.locator("#legal-qa-uc07-reviewed").uncheck()
    assert edited_copy.is_disabled(),"Unchecking must revoke clipboard gate"
    page.locator("#legal-qa-uc07-reviewed").check()
    assert edited_copy.is_enabled()
    page.locator("#legal-qa-source").fill("Bên A CẤU TRÚC KHÔNG HỢP LỆ. Nội dung này chỉ kiểm thử hành vi AI thiếu nhãn bản sửa.")
    assert page.locator("#legal-qa-result").is_hidden(),"Source change invalidates previously reviewed result"
    assert compare.is_hidden()
    assert edited_copy.is_disabled()
    # Invalid AI response must NOT unlock copy even with consent.
    page.locator("#legal-qa-run").click()
    grammar=page.locator("#legal-qa-grammar-review")
    grammar.wait_for(state="visible",timeout=15000)
    assert "Không tách được" in grammar.locator(":scope > summary").inner_text()
    assert compare.is_hidden(),"Malformed proposal must not be presented as a reviewable edit"
    assert edited_copy.is_disabled()
    assert page.locator("#legal-qa-copy").is_hidden()
    page.goto(origin+"/#uc-UC04",wait_until="domcontentloaded")
    page.wait_for_function("""() => document.querySelector('#legal-qa-grammar-review')?.hidden === true
      && document.querySelector('#legal-qa-uc07-compare')?.hidden === true
      && document.querySelector('#legal-qa-output')?.textContent === ''""",timeout=15000)
    assert not page.locator("#legal-qa-result").is_visible()
    assert not errors,(name,errors)
    print(f"PASS {name}: UC03/04/07 mobile/desktop review warnings isolated and no overflow")
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
