VAR outcome = ""
VAR match = false
// 开局随机定下真相：是谁熄了灯。
VAR culprit = ""
~ culprit = "{~走私客|守塔人自己|海里的东西}"
INCLUDE tower.ink

-> village

=== village ===
# scene: 渔村码头
雾很浓，{~码头的木板吱呀作响|海鸥在看不见的地方叫|浪拍着桩子}。
渔妇莉娜拦住你。 # npc: 莉娜 / 渔妇，丈夫的船还没回来
"灯塔三夜没亮了。求你去看看。" # vow: 让灯塔重新亮起来 / troublesome
- (ask)
* [安慰她，问守塔人的事 #move:befriend #stat:heart]
    {outcome:
    - "strong": 她平静下来，把守塔人的钥匙塞给你。 # fx: momentum+2
    - "weak": 她说守塔人最近总在半夜划船出海。 # clue: 守塔人半夜出海
    - else: 她哭着走开了，你什么也没问到。 # fx: spirit-1
    }
    -> ask
+ [出发去灯塔]
    -> tower
