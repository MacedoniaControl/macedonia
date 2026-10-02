"""
Histórico de ventas y compras desde los exportes de Valery.

Rehace lib/ux/history-data.ts leyendo los .xls ORIGINALES (no una copia):

  Ventas  · «Relación de Ventas Diarias (Detallado por Renglón)»
  Compras · «Libro de Compras Art. 75 Reg. IVA (Reexpresado)»

Reglas (todas en dólares, SIN IVA):
  · Venta neta de un renglón = Total Neto Bs / Tasa del Día. Costo = Total
    Costo $. Utilidad = venta neta - costo (es la «Utilidad-Venta $» de Valery).
  · Las devoluciones (DEV) vienen en negativo y restan.
  · Valery exporta el reporte de ventas en dos formatos: con fecha, tipo,
    documento y cliente en CADA renglón, o agrupado por documento (solo el
    primer renglón los lleva; los siguientes vienen vacíos y los heredan).
    Antes los renglones de continuación se saltaban.
  · Un renglón que aparece en el anual y en un parcial se cuenta una vez:
    (fecha, tipo, documento, código, cantidad, neto Bs). Se compara entre
    ARCHIVOS: si una factura trae dos renglones iguales (el mismo producto dos
    veces), los dos cuentan. (Antes se borraba el segundo: $14.200 en
    Sumigases, $3.800 en Sudematin.)
  · Compra neta = total $ - IVA - IGTF. Notas de crédito (NCR) restan; notas
    de débito (NDB) suman. Duplicados entre libros: (RIF, tipo, documento,
    fecha, total Bs).
  · Una factura idéntica a una nota de entrega del mismo día (cliente,
    código, cantidad y monto en dólares ±1 %) es la misma venta: la nota que se facturó.
    Valery exporta las dos; se cuenta una vez. (En Sudematin eran 5.033
    renglones, $365.021: el histórico anterior las sumaba dos veces.)
  · La nota que se factura DÍAS DESPUÉS también se cuenta una vez (se queda
    la nota, se descarta la factura), si:
      - la factura tiene 2 renglones o más y TODOS están en notas del mismo
        cliente de 1 a 60 días antes (mismo código y cantidad, monto ±3 %);
      - o tiene 1 renglón y hay una nota de 1 renglón igual (monto ±1 %) de
        1 a 7 días antes;
      - y ninguna de esas notas se anuló con una devolución antes de facturar.
    Probado contra el control (buscar las notas DESPUÉS de la factura, que
    solo coinciden por casualidad): 86–96 % de lo que descarta es doble.
  · Un renglón con utilidad fuera de rango (más de 20 veces su costo y más de
    $2.000, o sin costo) se lista para revisar y NO entra a los rankings. Si
    el error es del PRECIO (8 veces o más el precio habitual del producto, o
    un producto sin otras ventas) tampoco entra a los totales: es un monto mal
    cargado, no una venta. Si el precio es el habitual y lo raro es el costo,
    la venta es real y sí suma. (Confirmado por el usuario.) El caso que lo
    originó: 1 mascarilla de $0,20 facturada en 8.278.489,80 Bs (FAC 497 del
    26-08-2024), anulada con la devolución 162 del mismo día; salen las dos.
  · Lo que una empresa se «vende» a sí misma (consumo interno) no es venta.
  · Una recepción (RCM) con factura (FCM) del mismo proveedor y el mismo
    número es la misma compra: cuenta una vez, la factura. (Confirmado por el
    usuario; en Sumigases eran 275 recepciones.)
  · La factura 70693 de Star Gas es de Sudematin; Sumigases la registró como
    recepción y no cuenta en sus compras. (Confirmado por el usuario.)
  · Un mes con un hueco de más de 7 días sin ventas se marca incompleto.
  · Lo que Sumigases y Sudematin se venden entre sí NO cuenta: ni como venta
    de una ni como compra de la otra (es mover mercancía dentro del grupo, no
    vender). Compras: por el RIF del proveedor. Ventas: el exporte no trae
    RIF, así que por la razón social (Sudematin & GM es «Suministros de
    Materiales Industriales y Gases Medicinales»). Lo excluido queda sumado
    en meta.entreEmpresas.
    Excepción confirmada: lo que Sumigases registra en su libro a nombre de
    Sudematin SÍ es compra. Son compras a terceros que llegan por medio de
    Sudematin (gas de GUV, traslados, importaciones, Oxicar): casi ninguna
    coincide con una nota de entrega de Sudematin. En los rankings se
    muestran como «Por medio de Sudematin».

Uso:  python3 scripts/historico-valery.py <carpeta Sumigases> [--escribir]
Sin --escribir solo muestra el resumen y los renglones separados.
"""
import sys, glob, json, re, os, collections, datetime, unicodedata, html, xlrd

RAIZ = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/Desktop/Sumigases")
ESCRIBIR = "--escribir" in sys.argv
SALIDA = os.path.join(os.path.dirname(__file__), "..", "lib", "ux", "history-data.ts")

# Está en la carpeta de Sumigases pero es de SUDEMATIN: sus facturas (23014-23118)
# y notas (19261-19657) siguen la serie de Sudematin. Antes se sumaba a Sumigases.
VENTAS_AGOSTO_SUDEMATIN = f"{RAIZ}/Ventas Historico/Relacion de Ventas Diarias (Detallado por Renglon)29-07 AL 31-08-2026.xls"

FUENTES = {
    "sumigases": {
        "ventas": sorted(f for f in glob.glob(f"{RAIZ}/Ventas Historico/*.xls") if f != VENTAS_AGOSTO_SUDEMATIN)
                  + [f"{RAIZ}/Actual/Relacion de Ventas Diarias (Detallado por Renglon).xls"],
        # Todos los libros de la carpeta: «SEPTIEMBRE A DICIEMBRE 2023.xls» es un
        # libro aunque no lo diga el nombre. La «Relación de Compras del Mes» que
        # está ahí es de Sudematin (otro formato): no entra.
        "compras": sorted(f for f in glob.glob(f"{RAIZ}/Compras Historico/*.xls") if "Relación de Compras" not in unicodedata.normalize("NFC", f))
                   + [f"{RAIZ}/Actual/Libro de Compras Art  75 Reg IVA (Reexpresado).xls"],
    },
    "sudematin": {
        "ventas": sorted(glob.glob(f"{RAIZ}/Sudematin/Ventas/*.xls")) + [VENTAS_AGOSTO_SUDEMATIN],
        "compras": sorted(glob.glob(f"{RAIZ}/Sudematin/Compras/*.xls")),
    },
}

# La otra empresa del grupo, vista desde cada una.
HERMANA = {
    # Sin RIF: sus compras a nombre de Sudematin son de terceros (ver arriba).
    "sumigases": {"rif": set(), "nombre": re.compile(r"^(SUDEMATIN|SUMINISTROS? DE MATERIALES INDUSTRIALES)")},
    "sudematin": {"rif": {"J502789510"}, "nombre": re.compile(r"^SUMIGASES ORIENTE")},
}

# Ella misma, vista en su propio exporte de ventas.
PROPIA = {"sumigases": HERMANA["sudematin"]["nombre"], "sudematin": HERMANA["sumigases"]["nombre"]}
# Documentos de compra que están en el libro de una empresa pero son de la otra.
AJENAS = {"sumigases": {("J311377140", "70693")}, "sudematin": set()}

def fecha(v):
    if isinstance(v, float) and v > 20000:
        return xlrd.xldate_as_datetime(v, 0).date().isoformat()
    return None

def num(v):
    try: return float(v)
    except (TypeError, ValueError): return 0.0

def normal(s):
    s = unicodedata.normalize("NFD", str(s)).encode("ascii", "ignore").decode().upper()
    s = re.sub(r"\(.*\)$", "", s).strip()          # «COSTA NORTE, C.A. (COSTA NORTE, C.A)» → la primera parte
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    s = re.sub(r"\b(C ?A|S ?A|S ?R ?L|SACA|CA)\b", " ", s)
    return re.sub(r"\s+", " ", s).strip()

# Las facturas de cada empresa llevan su propia serie. Un archivo de ventas con
# facturas de la otra serie está en la carpeta equivocada: se detiene todo.
SERIE_FAC = {"sumigases": (1, 9999), "sudematin": (19000, 99999)}

def ventas(emp):
    aceptadas, filas, separados, archivos = collections.Counter(), [], [], []
    for f in FUENTES[emp]["ventas"]:
        s = xlrd.open_workbook(f).sheet_by_index(0)
        h = [str(x).strip() for x in s.row_values(0)]
        ix = {n: i for i, n in enumerate(h)}
        n, en_archivo, previo = 0, collections.Counter(), None
        for r in range(1, s.nrows):
            v = s.row_values(r)
            d = fecha(v[ix["Fecha Emision"]])
            codigo = str(v[ix["Codigo"]]).strip()
            if d:
                tipo, doc, cli = str(v[ix["Tipo Doc"]]).strip(), str(v[ix["Documento"]]).strip(), str(v[ix["Cliente"]]).strip()
                previo = (d, tipo, doc, cli)
            elif codigo and previo:
                # Formato agrupado: solo el primer renglón del documento lleva
                # fecha, tipo, número y cliente; los siguientes los heredan.
                d, tipo, doc, cli = previo
            else:
                continue   # fila de totales
            clave = (d, tipo, doc, codigo, num(v[ix["Cantidad"]]), round(num(v[ix["Total Neto Bs"]]), 2))
            # Entra si este archivo la trae más veces de las que ya entraron desde otros.
            en_archivo[clave] += 1
            if en_archivo[clave] <= aceptadas[clave]: continue
            aceptadas[clave] += 1; n += 1
            tasa = num(v[ix["Tasa del Dia"]])
            neto_bs = num(v[ix["Total Neto Bs"]])
            venta = neto_bs / tasa if tasa > 0 else num(v[ix["Total Operacion $"]]) / 1.16
            costo = num(v[ix["Total Costo $"]])
            fila = {"fecha": d, "tipo": tipo, "doc": clave[2], "codigo": clave[3], "producto": str(v[ix["Producto"]]).strip(),
                    "cliente": cli, "cantidad": clave[4], "venta": venta, "costo": costo, "util": venta - costo,
                    "neto_bs": neto_bs, "tasa": tasa}
            absurdo = abs(venta) >= 2000 and (abs(costo) <= 0.01 * abs(venta) or abs(venta) > 20 * abs(costo))
            fila["revisar"] = absurdo
            fila["hermana"] = bool(HERMANA[emp]["nombre"].match(normal(html.unescape(fila["cliente"]))))
            filas.append(fila)
            if absurdo: separados.append(fila)
        archivos.append((os.path.basename(f), n))
        desde, hasta = SERIE_FAC[emp]
        ajenas = [x["doc"] for x in filas[-n:] if x["tipo"] == "FAC" and not desde <= int(re.sub(r"\D", "", x["doc"]) or 0) <= hasta] if n else []
        if ajenas:
            sys.exit(f"{os.path.basename(f)}: trae facturas de la serie de la otra empresa ({ajenas[0]}…). ¿Está en la carpeta equivocada?")
    # La nota de entrega que después se facturó: se queda la nota, se descarta la factura gemela.
    # Primero las del mismo día (renglón por renglón), después las de días después (por factura).
    notas = collections.defaultdict(list)
    # Si la nota se devolvió ese mismo día, la factura es la única venta: es como
    # Valery convierte una nota en factura (nota → devolución → factura). Antes se
    # descartaba la factura Y la devolución restaba la nota: la venta desaparecía.
    devueltas = collections.Counter()
    for i, f in enumerate(filas):
        f["_i"] = i
        if f["tipo"] == "NET": notas[(f["fecha"], normal(f["cliente"]), f["codigo"], f["cantidad"])].append(f)
        if f["tipo"] == "DEV": devueltas[(f["fecha"], normal(f["cliente"]), f["codigo"], abs(f["cantidad"]))] += 1
    consumidas, fuera = set(), set()
    for f in filas:
        if f["tipo"] != "FAC": continue
        if devueltas[(f["fecha"], normal(f["cliente"]), f["codigo"], f["cantidad"])]: continue
        # En dólares, no en bolívares: la nota y su factura pueden llevar la tasa con
        # distintos decimales (158,93 / 158,9289) y los bolívares no dan iguales.
        libres = [q for q in notas.get((f["fecha"], normal(f["cliente"]), f["codigo"], f["cantidad"]), [])
                  if q["_i"] not in consumidas and abs(q["venta"] - f["venta"]) <= 0.01 * abs(q["venta"]) + 0.05]
        if libres: consumidas.add(libres[0]["_i"]); fuera.add(f["_i"])
    gemelas = len(fuera)
    despues = facturadas_despues(filas, consumidas, fuera)
    unicas = [f for f in filas if f["_i"] not in fuera]
    entre = [f for f in unicas if f["hermana"]]
    unicas = [f for f in unicas if not f["hermana"]]
    propias = [f for f in unicas if PROPIA[emp].match(normal(html.unescape(f["cliente"])))]
    unicas = [f for f in unicas if not PROPIA[emp].match(normal(html.unescape(f["cliente"])))]
    motivo_revisar(unicas)
    separados = [f for f in unicas if f["revisar"]]
    unicas = [f for f in unicas if f.get("motivo") != "precio"]
    archivos += [("facturas gemelas de una nota (no se suman)", -gemelas),
                 (f"renglones de {despues[0]} facturas de notas de días antes (no se suman)", -despues[1]), ("ventas a la otra empresa del grupo (no se suman)", -len(entre)),
                 ("ventas a sí misma (no se suman)", -len(propias)),
                 ("renglones con precio mal cargado (no se suman)", -sum(1 for f in separados if f["motivo"] == "precio"))]
    return unicas, separados, archivos, entre, propias

def motivo_revisar(filas):
    """A cada renglón a revisar le pone el motivo: «precio» (mal cargado: no suma) o «costo» (la venta es real)."""
    pu = collections.defaultdict(list)
    for f in filas:
        if f["tipo"] != "DEV" and f["cantidad"] > 0 and not f["revisar"]: pu[f["codigo"]].append(f["venta"] / f["cantidad"])
    for f in filas:
        if not f["revisar"]: continue
        habitual = sorted(pu[f["codigo"]])[len(pu[f["codigo"]]) // 2] if pu[f["codigo"]] else None
        unitario = abs(f["venta"]) / (abs(f["cantidad"]) or 1)
        f["motivo"] = "precio" if habitual is None or unitario > 8 * habitual else "costo"

def facturadas_despues(filas, consumidas, fuera):
    """Marca en `fuera` las facturas que facturan notas de días antes (reglas arriba).
    Devuelve (facturas, renglones)."""
    D = datetime.date.fromisoformat
    k = lambda f: (normal(f["cliente"]), f["codigo"], abs(f["cantidad"]))
    net, dev, facs = collections.defaultdict(list), collections.defaultdict(list), collections.defaultdict(list)
    for f in filas:
        if f["_i"] in fuera: continue
        if f["tipo"] == "NET" and f["_i"] not in consumidas: net[k(f)].append(f)
        elif f["tipo"] == "DEV": dev[k(f)].append(f)
        elif f["tipo"] == "FAC": facs[f["doc"]].append(f)
    renglones_nota = collections.Counter(f["doc"] for f in filas if f["tipo"] == "NET")
    n_fac = n_ren = 0
    for ls in sorted(facs.values(), key=lambda x: x[0]["fecha"]):
        fd, uno = D(ls[0]["fecha"]), len(ls) == 1
        dias, tol = (7, 0.01) if uno else (60, 0.03)
        tomadas = []
        for x in ls:
            ya = {t["_i"] for t in tomadas}
            c = [q for q in net[k(x)] if q["_i"] not in consumidas and q["_i"] not in ya
                 and 1 <= (fd - D(q["fecha"])).days <= dias and abs(q["venta"] - x["venta"]) <= tol * abs(q["venta"]) + 0.5
                 and (not uno or renglones_nota[q["doc"]] == 1)]
            if not c: break
            tomadas.append(c[0])
        else:
            if sum(x["venta"] for x in ls) <= 0: continue
            # Si la nota se devolvió antes de facturar, la factura es la única venta.
            if any(0 <= (D(d["fecha"]) - D(q["fecha"])).days and (D(d["fecha"]) - fd).days <= 3 for q in tomadas for d in dev[k(q)]):
                continue
            consumidas.update(q["_i"] for q in tomadas); fuera.update(x["_i"] for x in ls)
            n_fac += 1; n_ren += len(ls)
    return n_fac, n_ren

def sin_tildes(x):
    return unicodedata.normalize("NFD", str(x)).encode("ascii", "ignore").decode().strip().lower()

def tasa_de(tasas, d):
    """La tasa del día que Valery usó en las ventas de esa fecha, o la anterior más cercana."""
    if d in tasas: return tasas[d]
    antes = [k for k in tasas if k <= d]
    return tasas[max(antes)] if antes else (tasas[min(tasas)] if tasas else 0)

def compras(emp, tasas):
    vistos, filas, archivos = set(), [], []
    for f in FUENTES[emp]["compras"]:
        s = xlrd.open_workbook(f).sheet_by_index(0)
        h = [sin_tildes(x) for x in s.row_values(0)]
        def col(*nombres):
            for nm in nombres:
                if sin_tildes(nm) in h: return h.index(sin_tildes(nm))
            return None
        iT, iTd = col("Total Compras mas Impuesto"), col("Total Compras + Impuesto $")
        iF = col("Factor Cambio")
        imp_bs = [col(x) for x in ("ET Impuesto", "NA Impuesto", "NA Impuesto 4", "NA Impuesto 5", "ET Total IGTF", "NA Total IGTF")]
        n = 0
        for r in range(1, s.nrows):
            v = s.row_values(r)
            d = fecha(v[0])
            if not d: continue
            tipo, doc = str(v[1]).strip(), str(v[2]).strip()
            rif = str(v[col("RIF")]).strip().upper().replace("-", "")
            total_bs = num(v[iT])
            clave = (rif, tipo, doc, d, round(total_bs, 2))
            if clave in vistos: continue
            vistos.add(clave); n += 1
            # El libro viejo (julio 2023) no trae tasa: se usa la de las ventas de ese día.
            factor = num(v[iF]) if iF is not None else tasa_de(tasas, d)
            imp = sum(num(v[i]) for i in imp_bs if i is not None)
            neto_bs = total_bs - imp
            total_usd = num(v[iTd]) if iTd is not None else 0
            if factor > 0: neta = neto_bs / factor
            elif total_bs: neta = total_usd * (neto_bs / total_bs)
            else: neta = 0
            filas.append({"fecha": d, "tipo": tipo, "doc": doc, "proveedor": str(v[col("Razon Social")]).strip(), "rif": rif, "neta": neta, "bs": neto_bs})
        archivos.append((os.path.basename(f), n))
    # La recepción (RCM) que tiene su factura (FCM) del mismo proveedor con el
    # mismo número es la misma compra cargada dos veces: al llegar la mercancía
    # y al llegar la factura. Se queda la factura, que es el documento fiscal.
    numero = lambda d: re.sub(r"\D", "", d).lstrip("0")
    facturas = {(c["rif"], numero(c["doc"])) for c in filas if c["tipo"] == "FCM" and len(numero(c["doc"])) >= 3}
    recepciones = [c for c in filas if c["tipo"] == "RCM" and (c["rif"], numero(c["doc"])) in facturas]
    filas = [c for c in filas if not (c["tipo"] == "RCM" and (c["rif"], numero(c["doc"])) in facturas)]
    archivos.append(("recepciones (RCM) con su factura del mismo número (no se suman)", -len(recepciones)))
    entre = [c for c in filas if c["rif"] in HERMANA[emp]["rif"]]
    filas = [c for c in filas if c["rif"] not in HERMANA[emp]["rif"] and (c["rif"], c["doc"]) not in AJENAS[emp]]
    archivos.append(("compras a la otra empresa del grupo (no se suman)", -len(entre)))
    return filas, archivos, entre

def resumen(emp):
    vs, sep, av, ev, propias = ventas(emp)
    tasas = {}
    for f in vs + sep + ev:
        if f["tasa"] > 0: tasas.setdefault(f["fecha"], f["tasa"])
    cs, ac, ec = compras(emp, tasas)
    meses = collections.defaultdict(lambda: {"venta": 0.0, "costo": 0.0, "util": 0.0, "compra": 0.0,
                                             "ventaBs": 0.0, "costoBs": 0.0, "compraBs": 0.0})
    # Los bolívares de verdad: cada renglón a la tasa de SU día, la que trae
    # Valery. Pasar los dólares a la tasa de hoy daba cuatro veces lo facturado,
    # porque casi todo se vendió a tasas viejas.
    for f in vs:
        m = meses[f["fecha"][:7]]; m["venta"] += f["venta"]; m["costo"] += f["costo"]; m["util"] += f["util"]
        tasa = f["tasa"] if f["tasa"] > 0 else tasa_de(tasas, f["fecha"])
        m["ventaBs"] += f["neto_bs"] if f["tasa"] > 0 else f["venta"] * tasa
        m["costoBs"] += f["costo"] * tasa
    for c in cs:
        meses[c["fecha"][:7]]["compra"] += c["neta"]
        meses[c["fecha"][:7]]["compraBs"] += c["bs"]
    entre = {"ventas": round(sum(f["venta"] for f in ev)), "compras": round(sum(c["neta"] for c in ec)),
             # Hasta dónde llega cada archivo, con o sin la otra empresa.
             "_ventas_hasta": max(f["fecha"] for f in vs + ev), "_compras_hasta": max(c["fecha"] for c in cs + ec),
             "_propio": round(sum(f["venta"] for f in propias))}
    return vs, sep, av, cs, ac, meses, entre

def nombre_mas_usado(nombres):
    limpio = [re.sub(r"\s*\(.*$", "", html.unescape(n)).strip() for n in nombres]  # Valery exporta «&amp;»
    return collections.Counter(limpio).most_common(1)[0][0]

def huecos(fechas, desde, hasta, dias=7):
    """Meses con un hueco de más de `dias` días sin ventas (en el rango con datos)."""
    import datetime
    ds = sorted(set(fechas)); malos = {}
    for a, b in zip(ds, ds[1:]):
        da, db = datetime.date.fromisoformat(a), datetime.date.fromisoformat(b)
        # La temporada de Navidad (del 15-12 al 15-01) no cuenta como hueco.
        navidad = (da.month == 12 and da.day >= 15) and ((db.month == 12) or (db.month == 1 and db.day <= 15))
        if (db - da).days > dias and not navidad:
            falta = f"sin ventas del {(da + datetime.timedelta(days=1)).strftime('%d-%m')} al {(db - datetime.timedelta(days=1)).strftime('%d-%m-%Y')}"
            malos.setdefault(b[:7] if da.month != db.month else a[:7], falta)
    return malos

def armar(emp):
    vs, sep, av, cs, ac, meses, entre = resumen(emp)
    yms = sorted(k for k in meses if meses[k]["venta"] or meses[k]["compra"])
    primero = min(f["fecha"] for f in vs)[:7]
    yms = [y for y in yms if y >= primero]
    r2 = lambda x: round(x)
    months = [{"ym": y, "venta": r2(meses[y]["venta"]), "costo": r2(meses[y]["costo"]), "util": r2(meses[y]["venta"]) - r2(meses[y]["costo"]), "compra": r2(meses[y]["compra"]),
               "ventaBs": r2(meses[y]["ventaBs"]), "costoBs": r2(meses[y]["costoBs"]), "utilBs": r2(meses[y]["ventaBs"]) - r2(meses[y]["costoBs"]),
               "compraBs": r2(meses[y]["compraBs"])} for y in yms]
    anios = collections.defaultdict(lambda: {"venta": 0, "costo": 0, "util": 0, "compra": 0})
    for m in months:
        a = anios[int(m["ym"][:4])]
        for k in ("venta", "costo", "util", "compra"): a[k] += m[k]
    pct = lambda a, b: round(100 * a / b, 1) if b else 0
    years = [{"year": y, **a, "margen": pct(a["util"], a["venta"]), "roi": pct(a["util"], a["costo"])} for y, a in sorted(anios.items())]
    t = {k: sum(m[k] for m in months) for k in ("venta", "costo", "util", "compra")}
    t.update({k: sum(m[k] for m in months) for k in ("ventaBs", "costoBs", "utilBs", "compraBs")})
    totals = {**t, "margen": pct(t["util"], t["venta"]), "roi": pct(t["util"], t["costo"])}
    buenas = [f for f in vs if not f["revisar"]]
    prod = collections.defaultdict(lambda: {"util": 0, "venta": 0, "qty": 0, "nombres": []})
    for f in buenas:
        p = prod[f["codigo"]]; p["util"] += f["util"]; p["venta"] += f["venta"]; p["qty"] += f["cantidad"]; p["nombres"].append(f["producto"])
    topProductos = [{"codigo": c, "nombre": collections.Counter(p["nombres"]).most_common(1)[0][0], "util": r2(p["util"]), "venta": r2(p["venta"]), "qty": r2(p["qty"])}
                    for c, p in sorted(prod.items(), key=lambda x: -x[1]["util"])[:8]]
    cli = collections.defaultdict(lambda: {"venta": 0, "nombres": []})
    for f in buenas:
        c = cli[normal(f["cliente"])]; c["venta"] += f["venta"]; c["nombres"].append(f["cliente"])
    topClientes = [{"nombre": nombre_mas_usado(c["nombres"]), "venta": r2(c["venta"])} for _, c in sorted(cli.items(), key=lambda x: -x[1]["venta"])[:6]]
    prov = collections.defaultdict(lambda: {"compra": 0, "nombres": []})
    for c in cs:
        p = prov[c["rif"] or normal(c["proveedor"])]; p["compra"] += c["neta"]; p["nombres"].append(c["proveedor"])
    # Las compras de terceros que Sumigases registra a nombre de Sudematin.
    nombre_prov = lambda k, p: "Por medio de Sudematin (GUV, traslados, importaciones)" if k == "J316971414" else nombre_mas_usado(p["nombres"])
    topProveedores = [{"nombre": nombre_prov(k, p), "compra": r2(p["compra"])} for k, p in sorted(prov.items(), key=lambda x: -x[1]["compra"])[:6]]
    ventas_hasta, compras_hasta, propio = entre.pop("_ventas_hasta"), entre.pop("_compras_hasta"), entre.pop("_propio")
    incompletos = [{"ym": ym, "motivo": m} for ym, m in sorted(huecos([f["fecha"] for f in vs], primero, ventas_hasta).items())]
    revisar = [{"fecha": f["fecha"], "tipo": f["tipo"], "documento": f["doc"], "cliente": re.sub(r"\s*\(.*$", "", html.unescape(f["cliente"])).strip(),
                "producto": f["producto"], "cantidad": f["cantidad"], "venta": round(f["venta"], 2), "costo": round(f["costo"], 2), "motivo": f["motivo"]}
               for f in sorted(sep, key=lambda x: -abs(x["venta"]))]
    meta = {"desde": yms[0], "hasta": yms[-1], "ventasHasta": ventas_hasta, "comprasHasta": compras_hasta, "incompletos": incompletos, "revisar": revisar, "entreEmpresas": entre, "consumoPropio": propio}
    return {"meta": meta, "totals": totals, "years": years, "months": months, "topProductos": topProductos, "topClientes": topClientes, "topProveedores": topProveedores}

def escribir():
    datos = {emp: armar(emp) for emp in FUENTES}
    with open(SALIDA, encoding="utf-8") as fh:
        viejo = fh.read()
    i = viejo.index("export const HISTORY")
    cabeza, cola = viejo[:i], viejo[viejo.index("\n", i) + 1:]   # lo de antes y después de los datos se conserva
    cabeza = re.sub(r"^// Datos históricos REALES[\s\S]*?\n\nexport type HistMonth", HEAD + "\n\nexport type HistMonth", cabeza, count=1)
    with open(SALIDA, "w", encoding="utf-8") as fh:
        fh.write(cabeza + "export const HISTORY: Record<EmpresaHist, CompanyHistory> = " + json.dumps(datos, ensure_ascii=False) + ";\n" + cola)
    return datos

HEAD = """// Datos históricos REALES por empresa (Valery), en dólares y SIN IVA.
//
// Generado con scripts/historico-valery.py desde los .xls originales:
// «Relación de Ventas Diarias (Detallado por Renglón)» y «Libro de Compras
// Art. 75 Reg. IVA (Reexpresado)». Las reglas están en ese script. En corto:
//   · venta = neto sin IVA; utilidad = venta - costo (la de Valery);
//   · devoluciones y notas de crédito restan; duplicados entre archivos, una vez;
//   · la factura de una nota de entrega (la nota que se facturó, el mismo día
//     o días después) no se vuelve a sumar;
//   · renglones con utilidad fuera de rango no entran a los rankings y quedan
//     en meta.revisar; los meses con huecos, en meta.incompletos;
//   · lo que Sumigases y Sudematin se venden entre sí no cuenta (meta.entreEmpresas),
//     ni lo que cada una se vende a sí misma (meta.consumoPropio);
//   · un renglón con el precio mal cargado no suma a nada (meta.revisar, motivo «precio»).
// No editar a mano: volver a correr el script."""

if __name__ == "__main__" and ESCRIBIR:
    d = escribir()
    for emp, x in d.items():
        print(emp, x["meta"]["desde"], "→", x["meta"]["hasta"], "ventas hasta", x["meta"]["ventasHasta"], "compras hasta", x["meta"]["comprasHasta"])
        print("  totales", x["totals"]); print("  entre empresas (fuera)", x["meta"]["entreEmpresas"]); print("  incompletos", x["meta"]["incompletos"]); print("  a revisar", len(x["meta"]["revisar"]))
        for y in x["years"]: print("  ", y)
        print("  top productos", [(p["nombre"][:26], p["util"]) for p in x["topProductos"]])
        print("  top clientes", [(c["nombre"][:26], c["venta"]) for c in x["topClientes"]])
        print("  top proveedores", [(p["nombre"][:22], p["compra"]) for p in x["topProveedores"]])
    sys.exit(0)

if __name__ == "__main__":
    for emp in FUENTES:
        vs, sep, av, cs, ac, meses, entre = resumen(emp)
        entre = {k: v for k, v in entre.items() if not k.startswith("_")}
        print(f"\n  entre empresas (fuera): {entre}")
        print(f"\n===== {emp}")
        for a, n in av: print("  ventas ", n, a)
        for a, n in ac: print("  compras", n, a)
        print("  renglones de venta separados:", len(sep))
        for f in sorted(sep, key=lambda x: -abs(x["venta"]))[:15]:
            print(f"    {f['fecha']} {f['tipo']} {f['doc']} {f['cliente'][:28]:28} {f['cantidad']:>7} × {f['producto'][:30]:30} venta ${f['venta']:>12,.2f} costo ${f['costo']:>9,.2f} ({f['neto_bs']:,.2f} Bs a {f['tasa']})")
        anios = collections.defaultdict(lambda: [0.0, 0.0, 0.0, 0.0])
        for ym, m in meses.items():
            a = anios[ym[:4]]; a[0] += m["venta"]; a[1] += m["costo"]; a[2] += m["util"]; a[3] += m["compra"]
        for y in sorted(anios):
            v, c, u, co = anios[y]
            print(f"  {y}: venta ${v:>12,.0f}  costo ${c:>12,.0f}  util ${u:>12,.0f}  margen {100*u/v if v else 0:5.1f}%  roi {100*u/c if c else 0:6.1f}%  compras ${co:>12,.0f}")
