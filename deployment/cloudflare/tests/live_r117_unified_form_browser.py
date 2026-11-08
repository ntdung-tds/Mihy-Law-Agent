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
                return reply(route,payload={"events":[{"action":"details_saved","created_at":1800000000}]})
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
    # R123: a PDF is recognized by its red document-shaped icon, not text alone.
    pdf_icon=page.locator("#case-r2-list .case-file-type-icon--pdf")
    assert pdf_icon.count()==1
    assert pdf_icon.first.get_attribute("role")=="img"
    assert pdf_icon.first.get_attribute("aria-label")=="Tệp PDF"
    assert pdf_icon.first.locator("svg path").count()==2
    assert pdf_icon.first.locator("svg text").text_content()=="PDF"
    first_row=page.locator("#case-r2-list .case-file-row").first.bounding_box()
    assert first_row and first_row["height"]<=108,(name,first_row)
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
    width=page.evaluate("document.documentElement.scrollWidth")
    assert width<=viewport["width"]+4,(name,width,viewport)
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
