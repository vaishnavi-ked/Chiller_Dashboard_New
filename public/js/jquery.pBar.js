/**
 * pBar 1.0
 * https://github.com/lastdates/pBar
 */
 ! function(i) {
    var r, t = ";min-height:9px;border-radius:",
        a = function(i) {
            return r[parseInt(i * r.length / 101)]
        };
    i.fn.pBar = function() {
        return this.each(function() {
            // setInterval(function(){
            var t = i(this),
                n = t.data("from"),
                o = t.data("to");
            // alert(o);
            r = (t.data("color") || "#1cc88999,#f6c23e99,#e74a3b99").split(","), t.html('<div style="width:' + n + "%;background-color:" + a(n) + '">' + o + '%</div>').prop("title", o + "%").attr("onclick", "$(this).pBar();"), t.children("div").width(o + "%").css("background-color", a(o))

        })
    }, i("<style>.pBar{display:inline-block;min-width:350px" + t + "2px;border:1px solid #ccc;padding:1px; margin:5px auto;}.pBar div{height:100%" + t + "1px;transition:all 1s linear 0s;box-sizing:border-box}</style>").appendTo("head"), i(document).ready(function() {
        // i(".pBar").pBar();
        // setInterval(function(){
            i(".pBar").pBar()
        // },3000);
    })
}(jQuery);