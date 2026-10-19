"""Extract supplied PDF/EPUB text locally. Never execute embedded content.

Usage: python scripts/extrair-livros.py INPUT OUTPUT.json
Requires pypdf for PDFs; EPUB uses only Python's standard library.
"""
import hashlib
import json
import posixpath
import re
import sys
import unicodedata
from pathlib import Path
from urllib.parse import unquote
from xml.etree import ElementTree as ET
from zipfile import ZipFile


def norm(text):
    return "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn").lower()


def tidy(text):
    return re.sub(r"\n{3,}", "\n\n", re.sub(r"[ \t]+", " ", text.replace("\u00ad", "").replace("\u00a0", " "))).strip()


def label(node):
    return node.tag.rsplit("}", 1)[-1]


def xml(raw):
    if re.search(br"<!ENTITY", raw, re.I):
        raise ValueError("Entidades XML personalizadas não são aceitas.")
    return ET.fromstring(raw)


def extract_pdf(file):
    import pypdf
    reader = pypdf.PdfReader(file)
    if reader.is_encrypted:
        raise ValueError("PDF protegido: fornecer versão legível autorizada.")
    units, excluded, chapters = [], [], []
    # Transcribed headings, checked against this edition. The PDF's small caps
    # insert spaces inside words and some chapters begin directly with prose.
    titles = ["Criminologia clássica", "Criminologia positivista: método indutivo", "Criminologia positivista: modelos explicativos",
              "Teorias psicanalíticas da agressividade", "Durkheim, fato social e anomia", "Merton, metas culturais e meios institucionais",
              "Escola Ecológica de Chicago", "Teoria da desorganização social", "Teoria da associação diferencial: Sutherland",
              "Teorias subculturais", "Teorias multifatoriais", "Criminologia da reação social: labeling approach",
              "David Matza e o naturalismo criminológico", "Fenomenologia e etnometodologia criminológica",
              "Teorias do conflito de autoridade: Dahrendorf e Turk", "Marx e a criminologia do conflito de classes",
              "Alessandro Baratta e a criminologia crítica", "Criminologia crítica ou radical: Brasil e América Latina",
              "Criminologia atuarial", "Teoria da tolerância zero", "Direito penal do inimigo",
              "Jock Young, o realismo de esquerda e a criminologia cultural", "Criminologia crítica feminista", "A economia política da punição"]
    chapter, chapter_number = None, None
    bibliography = False
    for index, page in enumerate(reader.pages, 1):
        text = tidy(page.extract_text() or "")
        # This supplied edition has no reliable PDF outlines. Detect the actual
        # chapter openings, not the print-page numbers listed in its contents.
        match = re.search(r"^\s*Cap[ií]tulo\s+(\d+)\s*\n", text[:250], re.I | re.M)
        if match and int(match[1]) == (chapter_number or 0) + 1:
            chapter_number = int(match[1]); chapter = f"Capítulo {chapter_number} — {titles[chapter_number - 1]}"
            chapters.append({"number": chapter_number, "title": chapter, "pdfPage": index})
        if chapter_number == 24 and re.match(r"^(?:\d+\s*)?bibliograf", norm(text[:120])):
            bibliography = True
        reason = "pré-textuais" if chapter_number is None else "bibliografia final" if bibliography else "sem texto suficiente" if len(text) < 80 else None
        if reason:
            excluded.append({"pdfPage": index, "reason": reason}); continue
        units.append({"format": "pdf", "page": index, "chapter": chapter, "chapterNumber": chapter_number,
                      "author": "Juarez Cirino dos Santos", "text": text})
    if len(chapters) != 24:
        raise ValueError(f"Esperados 24 capítulos nesta edição; encontrados {len(chapters)}. Conferir extração.")
    return {"format": "pdf", "method": f"pypdf {pypdf.__version__}; capítulos detectados na página física; pré-textuais/bibliografia fora do índice",
            "metadata": {"title": "Criminologia: contribuição para crítica da economia da punição", "authors": ["Juarez Cirino dos Santos"],
                         "publisher": "Tirant lo Blanch", "year": "2021", "edition": "1", "pdfPages": len(reader.pages),
                         "pagination": "página física do PDF; não inferida do sumário", "chapters": chapters}, "units": units, "excluded": excluded}


def extract_epub(file):
    units, excluded, chapters = [], [], []
    with ZipFile(file) as archive:
        infos = archive.infolist()
        if sum(i.file_size for i in infos) > 200_000_000 or any(i.file_size > 40_000_000 for i in infos):
            raise ValueError("EPUB excede o limite de extração.")
        if any(i.flag_bits & 1 for i in infos):
            raise ValueError("EPUB possui membros criptografados.")
        if archive.read("mimetype").strip() != b"application/epub+zip":
            raise ValueError("EPUB inválido.")
        container = xml(archive.read("META-INF/container.xml"))
        opf = next(n.attrib["full-path"] for n in container.iter() if label(n) == "rootfile")
        package = xml(archive.read(opf)); base = posixpath.dirname(opf)
        manifest = {n.attrib["id"]: n.attrib for n in package.iter() if label(n) == "item"}
        spine = [n.attrib["idref"] for n in package.iter() if label(n) == "itemref"]
        metadata = {k: [n.text for n in package.iter() if label(n) == k and n.text] for k in ["title", "creator", "publisher", "date", "identifier"]}
        for item_id in spine:
            item = manifest[item_id]
            path = posixpath.normpath(posixpath.join(base, unquote(item["href"].split("#")[0])))
            if path.startswith("../") or path.startswith("/") or "\\" in path:
                raise ValueError("Caminho EPUB inválido.")
            root = xml(archive.read(path))
            title_node = next((n for n in root.iter() if n.get("class") == "chaptitle"), None)
            if title_node is None:
                excluded.append({"path": path, "reason": "capa, cadastro, autores, sumário ou expediente"}); continue
            def without_notes(n):
                if label(n) in ["sup", "script", "style"]:
                    return ""
                return (n.text or "") + "".join(without_notes(c) + (c.tail or "") for c in n)
            chapter_title = tidy(without_notes(title_node)).rstrip("*† ")
            author_node = next((n for n in root.iter() if n.get("class") == "chapau"), None)
            author = tidy(without_notes(author_node)).rstrip("*† ") if author_node is not None else None
            if not author:
                raise ValueError(f"Capítulo sem autoria identificada: {path}")
            chapter_number = len(chapters) + 1
            chapters.append({"number": chapter_number, "title": chapter_title, "author": author, "path": path})
            section, section_id, paragraphs = chapter_title, title_node.get("id"), []
            stopped = False
            def flush():
                if paragraphs:
                    units.append({"format": "epub", "chapter": chapter_title, "chapterNumber": chapter_number, "author": author,
                                  "section": section, "sectionId": section_id, "path": path, "text": tidy("\n\n".join(paragraphs))})
                    paragraphs.clear()
            # Blocks only, once each. Exclude duplicated chapter outlines, images,
            # publisher forms, reference lists and contributor biographies.
            def visit(n):
                nonlocal section, section_id, stopped
                tag = label(n); classes = set(n.get("class", "").split())
                if classes & {"fig"} or tag == "img":
                    excluded.append({"path": path, "reason": "imagem/figura sem OCR; texto visual não indexado"}); return
                if tag in ["head", "script", "style", "nav"] or classes & {"outlchap", "chapoutlhd", "chapau", "chaptitle"}:
                    return
                if tag in ["h2", "h3", "h4"]:
                    text = tidy(without_notes(n))
                    if "referencias bibliograf" in norm(text) or norm(text).strip() in ["bibliografia", "referencias"]:
                        flush(); stopped = True; excluded.append({"path": path, "section": text, "reason": "referências do capítulo"}); return
                    if not stopped:
                        flush(); section, section_id = text, n.get("id")
                    return
                if stopped:
                    return
                if tag in ["p", "blockquote", "li", "table"]:
                    text = tidy(without_notes(n))
                    if text: paragraphs.append(text)
                    return
                for child in n: visit(child)
            body = next(n for n in root.iter() if label(n) == "body")
            visit(body); flush()
        if len(chapters) != 12:
            raise ValueError(f"Esperados 12 capítulos nesta edição; encontrados {len(chapters)}.")
        return {"format": "epub", "method": "zipfile + ElementTree; ordem do spine; autoria por capítulo; seções XHTML, sem paginação inventada",
                "metadata": {**metadata, "chapters": chapters, "pagination": "capítulo, seção e caminho XHTML; EPUB sem página física estável"},
                "units": units, "excluded": excluded}


def main():
    file, output = map(Path, sys.argv[1:3])
    if output.exists(): raise ValueError("Extração já existe; use outra versão.")
    if file.suffix.lower() == ".pdf": data = extract_pdf(file)
    elif file.suffix.lower() == ".epub": data = extract_epub(file)
    else: raise ValueError("Formato não suportado.")
    data = {"version": 1, "extractorSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), "inputSha256": hashlib.sha256(file.read_bytes()).hexdigest(), "inputBytes": file.stat().st_size, **data}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"file": str(output), "format": data["format"], "units": len(data["units"]), "excluded": len(data["excluded"]), "chapters": len(data["metadata"]["chapters"])}))


if __name__ == "__main__": main()
