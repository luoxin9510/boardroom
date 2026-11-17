=== tower ===
# scene: 雾灯塔
灯塔的门半开着。 # place: 雾灯塔 / 村子北边的礁石上
楼梯上有湿脚印，一直通到灯室。
* [仔细查看灯室 #move:probe #stat:wits]
    {outcome:
    - "strong": 你看清了：{culprit == "走私客": 灯芯被人剪断，地上有外地的烟草渣。|{culprit == "守塔人自己": 守塔人的日记摊开着，最后一页写着「不能再让他们看见」。|玻璃上有一道一道的盐痕，像是什么东西从海里爬上来过。}} # clue: 灯室里的痕迹 # milestone
    - "weak": 你找到一些痕迹，但楼下传来响动。 # fx: 二选一(health-1 \| supply-1)
    - else: 你在黑暗里踩空了。 # fx: health-?
    }
    -> ending
* [不管原因，先把灯点上]
    -> ending

=== ending ===
# scene: 天亮之前
你点燃了灯。光穿过雾，远处传来船笛。 # oracle: spark
{culprit == "海里的东西": 有什么东西在灯光照不到的水里看着你。 # foe: 海里的东西 / dangerous}
* [回村子报信]
    莉娜在码头等你。这个故事到这里结束了。 # milestone
    -> END
