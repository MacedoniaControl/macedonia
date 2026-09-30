"""
Histórico de ventas y compras desde los exportes de Valery.

Rehace lib/ux/history-data.ts leyendo los .xls ORIGINALES (no una copia):

  Ventas  · «Relación de Ventas Diarias (Detallado por Renglón)»
  Compras · «Libro de Compras Art. 75 Reg. IVA (Reexpresado)»

Reglas (todas en dólares, SIN IVA):
  · Venta neta de un renglón = Total Neto Bs / Tasa del Día. Costo = Total
    Costo $. Utilidad = venta neta - costo (es la «Utilidad-Venta $» de Valery).
  · Las devoluciones (DEV) vienen en negativo y restan.
  · Un renglón que aparece en el anual y en un parcial se cuenta una vez:
    (fecha, tipo, documento, código, cantidad, neto Bs).
  · Compra neta = total $ - IVA - IGTF. Notas de crédito (NCR) restan; notas
    de débito (NDB) suman. Duplicados entre libros: (RIF, tipo, documento,
    fecha, total Bs).
  · Una factura idéntica a una nota de entrega del mismo día (cliente,
    código, cantidad y monto) es la misma venta: la nota que se facturó.
    Valery exporta las dos; se cuenta una vez. (En Sudematin eran 5.033
    renglones, $365.021: el histórico anterior las sumaba dos veces.)
  · Un renglón con utilidad fuera de rango (más de 20 veces su costo y más de
    $2.000, o sin costo) NO entra a los rankings de productos y clientes y se
    lista para revisar. Sí entra a los totales: el caso que lo originó (1
    mascarilla de $0,20 facturada en 8.278.489,80 Bs, FAC 497 del 26-08-2024)
    se anula con la devolución 162 del mismo día, y sumadas dan $0,01.
  · Un mes con un hueco de más de 7 días sin ventas se marca incompleto.

Uso:  python3 scripts/historico-valery.py <carpeta Sumigases> [--escribir]
Sin --escribir solo muestra el resumen y los renglones separados.
"""
import sys, glob, json, re, os, collections, unicodedata, html, xlrd

RAIZ = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/Desktop/Sumigases")
ESCRIBIR = "--escribir" in sys.argv
SALIDA = os.path.join(os.path.dirname(__file__), "..", "lib", "ux", "history-data.ts")

FUENTES = {
    "sumigases": {
        "ventas": sorted(glob.glob(f"{RAIZ}/Ventas Historico/*.xls")) + [f"{RAIZ}/Actual/Relacion de Ventas Diarias (Detallado por Renglon).xls"],
        "compras": sorted(glob.glob(f"{RAIZ}/Compras Historico/*ibro de Compras*.xls")) + [f"{RAIZ}/Actual/Libro de Compras Art  75 Reg IVA (Reexpresado).xls"],
    },
    "sudematin": {
        "ventas": sorted(glob.glob(f"{RAIZ}/Sudematin/Ventas/*.xls")),
        "compras": sorted(glob.glob(f"{RAIZ}/Sudematin/Compras/*.xls")),
    },
}

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

def ventas(emp):
    vistos, filas, separados, archivos = set(), [], [], []
    for f in FUENTES[emp]["ventas"]:
        s = xlrd.open_workbook(f).sheet_by_index(0)
        h = [str(x).strip() for x in s.row_values(0)]
        ix = {n: i for i, n in enumerate(h)}
        n = 0
        for r in range(1, s.nrows):
            v = s.row_values(r)
            d = fecha(v[ix["Fecha Emision"]])
            if not d: continue
            tipo = str(v[ix["Tipo Doc"]]).strip()
            clave = (d, tipo, str(v[ix["Documento"]]).strip(), str(v[ix["Codigo"]]).strip(), num(v[ix["Cantidad"]]), round(num(v[ix["Total Neto Bs"]]), 2))
            if clave in vistos: continue
            vistos.add(clave); n += 1
            tasa = num(v[ix["Tasa del Dia"]])
            neto_bs = num(v[ix["Total Neto Bs"]])
            venta = neto_bs / tasa if tasa > 0 else num(v[ix["Total Operacion $"]]) / 1.16
            costo = num(v[ix["Total Costo $"]])
            fila = {"fecha": d, "tipo": tipo, "doc": clave[2], "codigo": clave[3], "producto": str(v[ix["Producto"]]).strip(),
                    "cliente": str(v[ix["Cliente"]]).strip(), "cantidad": clave[4], "venta": venta, "costo": costo, "util": venta - costo,
                    "neto_bs": neto_bs, "tasa": tasa}
            absurdo = abs(venta) >= 2000 and (abs(costo) <= 0.01 * abs(venta) or abs(venta) > 20 * abs(costo))
            fila["revisar"] = absurdo
            filas.append(fila)
            if absurdo: separados.append(fila)
        archivos.append((os.path.basename(f), n))
    # La nota de entrega que después se facturó: se queda la nota, se descarta la factura gemela.
    notas = collections.Counter((f["fecha"], normal(f["cliente"]), f["codigo"], f["cantidad"], round(f["neto_bs"])) for f in filas if f["tipo"] == "NET")
    unicas, gemelas = [], 0
    for f in filas:
        k = (f["fecha"], normal(f["cliente"]), f["codigo"], f["cantidad"], round(f["neto_bs"]))
        if f["tipo"] == "FAC" and notas.get(k, 0) > 0:
            notas[k] -= 1; gemelas += 1; continue
        unicas.append(f)
    return unicas, [f for f in separados if f in unicas], archivos + [(f"facturas gemelas de una nota (no se suman)", -gemelas)]

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
            filas.append({"fecha": d, "tipo": tipo, "proveedor": str(v[col("Razon Social")]).strip(), "rif": rif, "neta": neta})
        archivos.append((os.path.basename(f), n))
    return filas, archivos

def resumen(emp):
    vs, sep, av = ventas(emp)
    tasas = {}
    for f in vs + sep:
        if f["tasa"] > 0: tasas.setdefault(f["fecha"], f["tasa"])
    cs, ac = compras(emp, tasas)
    meses = collections.defaultdict(lambda: {"venta": 0.0, "costo": 0.0, "util": 0.0, "compra": 0.0})
    for f in vs:
        m = meses[f["fecha"][:7]]; m["venta"] += f["venta"]; m["costo"] += f["costo"]; m["util"] += f["util"]
    for c in cs:
        meses[c["fecha"][:7]]["compra"] += c["neta"]
    return vs, sep, av, cs, ac, meses

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
    vs, sep, av, cs, ac, meses = resumen(emp)
    yms = sorted(k for k in meses if meses[k]["venta"] or meses[k]["compra"])
    primero = min(f["fecha"] for f in vs)[:7]
    yms = [y for y in yms if y >= primero]
    r2 = lambda x: round(x)
    months = [{"ym": y, "venta": r2(meses[y]["venta"]), "costo": r2(meses[y]["costo"]), "util": r2(meses[y]["util"]), "compra": r2(meses[y]["compra"])} for y in yms]
    anios = collections.defaultdict(lambda: {"venta": 0, "costo": 0, "util": 0, "compra": 0})
    for m in months:
        a = anios[int(m["ym"][:4])]
        for k in ("venta", "costo", "util", "compra"): a[k] += m[k]
    pct = lambda a, b: round(100 * a / b, 1) if b else 0
    years = [{"year": y, **a, "margen": pct(a["util"], a["venta"]), "roi": pct(a["util"], a["costo"])} for y, a in sorted(anios.items())]
    t = {k: sum(m[k] for m in months) for k in ("venta", "costo", "util", "compra")}
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
    topProveedores = [{"nombre": nombre_mas_usado(p["nombres"]), "compra": r2(p["compra"])} for _, p in sorted(prov.items(), key=lambda x: -x[1]["compra"])[:6]]
    ventas_hasta = max(f["fecha"] for f in vs); compras_hasta = max(c["fecha"] for c in cs)
    incompletos = [{"ym": ym, "motivo": m} for ym, m in sorted(huecos([f["fecha"] for f in vs], primero, ventas_hasta).items())]
    revisar = [{"fecha": f["fecha"], "tipo": f["tipo"], "documento": f["doc"], "cliente": re.sub(r"\s*\(.*$", "", html.unescape(f["cliente"])).strip(),
                "producto": f["producto"], "cantidad": f["cantidad"], "venta": round(f["venta"], 2), "costo": round(f["costo"], 2)}
               for f in sorted(sep, key=lambda x: -abs(x["venta"]))]
    meta = {"desde": yms[0], "hasta": yms[-1], "ventasHasta": ventas_hasta, "comprasHasta": compras_hasta, "incompletos": incompletos, "revisar": revisar}
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
//   · la factura gemela de una nota de entrega (la nota que se facturó) no se
//     vuelve a sumar;
//   · renglones con utilidad fuera de rango no entran a los rankings y quedan
//     en meta.revisar; los meses con huecos, en meta.incompletos.
// No editar a mano: volver a correr el script."""

if __name__ == "__main__" and ESCRIBIR:
    d = escribir()
    for emp, x in d.items():
        print(emp, x["meta"]["desde"], "→", x["meta"]["hasta"], "ventas hasta", x["meta"]["ventasHasta"], "compras hasta", x["meta"]["comprasHasta"])
        print("  totales", x["totals"]); print("  incompletos", x["meta"]["incompletos"]); print("  a revisar", len(x["meta"]["revisar"]))
        for y in x["years"]: print("  ", y)
        print("  top productos", [(p["nombre"][:26], p["util"]) for p in x["topProductos"]])
        print("  top clientes", [(c["nombre"][:26], c["venta"]) for c in x["topClientes"]])
        print("  top proveedores", [(p["nombre"][:22], p["compra"]) for p in x["topProveedores"]])
    sys.exit(0)

if __name__ == "__main__":
    for emp in FUENTES:
        vs, sep, av, cs, ac, meses = resumen(emp)
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
