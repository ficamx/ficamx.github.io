(() => {
  const EXTRA_PORTS = [
    {id:'incheon-namhang',name:'인천남항',region:'서해',tideCode:'DT_0001',tideStation:'인천',lat:37.4539,lon:126.6130},
    {id:'yeonanbudu',name:'연안부두',region:'서해',tideCode:'DT_0001',tideStation:'인천',lat:37.4535905,lon:126.605802},
    {id:'manseokbudu',name:'만석부두',region:'서해',tideCode:'DT_0001',tideStation:'인천',lat:37.4913253,lon:126.6219544},
    {id:'jinduhang',name:'진두항',region:'서해',tideCode:'DT_0043',tideStation:'영흥도',lat:37.25616514,lon:126.4994582},
    {id:'oidohang',name:'오이도항',region:'서해',tideCode:'DT_0052',tideStation:'인천송도',lat:37.34528165,lon:126.68794077},
    {id:'janggohang',name:'장고항',region:'서해',tideCode:'SO_1270',tideStation:'삼길포항',lat:37.03173,lon:126.558741},
    {id:'mageompohang',name:'마검포항',region:'서해',tideCode:'SO_0574',tideStation:'백사장항',lat:36.62201846,lon:126.28452984},
    {id:'mohanghang',name:'모항항',region:'서해',tideCode:'SO_0699',tideStation:'천리포항',lat:36.78718967,lon:126.17419870},
    {id:'dangamhang',name:'당암항',region:'서해',tideCode:'SO_0574',tideStation:'백사장항',lat:36.6214489,lon:126.3555501},
    {id:'gumaehang',name:'구매항',region:'서해',tideCode:'DT_0025',tideStation:'보령',lat:36.424626033059,lon:126.43098875421},
    {id:'yamidohang',name:'야미도항',region:'서해',tideCode:'DT_0018',tideStation:'군산',lat:35.8408397187732,lon:126.489013056996},
    {id:'mokpo-bukhang',name:'목포북항',region:'서해',tideCode:'DT_0007',tideStation:'목포',lat:34.80840188495,lon:126.36848051555},
    {id:'gukdonghang',name:'국동항',region:'남해',tideCode:'DT_0016',tideStation:'여수',lat:34.7289,lon:127.7212},
    {id:'sinwolhang',name:'신월항',region:'남해',tideCode:'DT_0016',tideStation:'여수',lat:34.7225,lon:127.7070},
    {id:'sohohang',name:'소호항',region:'남해',tideCode:'DT_0016',tideStation:'여수',lat:34.73905664,lon:127.6406276},
    {id:'samdeokhang',name:'삼덕항',region:'남해',tideCode:'DT_0014',tideStation:'통영',lat:34.79598027,lon:128.38398206},
    {id:'sokcheonhang',name:'속천항',region:'남해',tideCode:'DT_0054',tideStation:'진해',lat:35.14425001,lon:128.6732993},
    {id:'jangseungpohang',name:'장승포항',region:'남해',tideCode:'DT_0029',tideStation:'거제도',lat:34.8625,lon:128.7250},
    {id:'jisepohang',name:'지세포항',region:'남해',tideCode:'DT_0029',tideStation:'거제도',lat:34.82902063,lon:128.70599908},
    {id:'gujorahang',name:'구조라항',region:'남해',tideCode:'DT_0029',tideStation:'거제도',lat:34.8032196,lon:128.6975824},
    {id:'ganggu-sinhang',name:'강구신항',region:'동해',tideCode:'SO_0737',tideStation:'강구항',lat:36.37089789,lon:129.39161604},
    {id:'jeongjahang',name:'정자항',region:'동해',tideCode:'DT_0020',tideStation:'울산',lat:35.5789,lon:129.4234},
    {id:'doduhang',name:'도두항',region:'제주',tideCode:'DT_0004',tideStation:'제주',lat:33.50614858,lon:126.46497201},
    {id:'hallimhang',name:'한림항',region:'제주',tideCode:'DT_0023',tideStation:'모슬포',lat:33.414,lon:126.266},
    {id:'aewolhang',name:'애월항',region:'제주',tideCode:'DT_0004',tideStation:'제주',lat:33.464,lon:126.308},
    {id:'sinchanghang',name:'신창항',region:'제주',tideCode:'DT_0023',tideStation:'모슬포',lat:33.3483,lon:126.1790},
    {id:'sagyehang',name:'사계항',region:'제주',tideCode:'SO_1277',tideStation:'화순항',lat:33.228065,lon:126.305395},
    {id:'gimnyeonghang',name:'김녕항',region:'제주',tideCode:'DT_0004',tideStation:'제주',lat:33.5539908,lon:126.7486607},
    {id:'wimihang',name:'위미항',region:'제주',tideCode:'DT_0010',tideStation:'서귀포',lat:33.26999984,lon:126.661385}
  ];

  const originalFetch = window.fetch.bind(window);
  window.fetch = async function(input, init) {
    const response = await originalFetch(input, init);
    try {
      const rawUrl = typeof input === 'string' ? input : (input && input.url) || '';
      const url = new URL(rawUrl, window.location.href);
      if (url.pathname.endsWith('/ports.json')) {
        const existing = await response.clone().json();
        if (Array.isArray(existing)) {
          const existingIds = new Set(existing.map(p => p.id));
          const existingNames = new Set(existing.map(p => p.name));
          const additions = EXTRA_PORTS.filter(p => !existingIds.has(p.id) && !existingNames.has(p.name));
          const merged = [...additions, ...existing];
          return new Response(JSON.stringify(merged), {
            status: response.status,
            statusText: response.statusText,
            headers: {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}
          });
        }
      }
    } catch (_) {}
    return response;
  };
})();
