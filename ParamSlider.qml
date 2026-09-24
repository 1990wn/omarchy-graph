import QtQuick
import qs.Commons
import qs.Ui

// Labeled slider with a short track, numeric entry, and a play/pause button.
Item {
  id: root

  property string label: ""
  property string valueText: ""
  property real value: 0
  property real minimum: -10
  property real maximum: 10
  property real step: 0.1
  property bool integer: false
  property bool animating: false
  property var bar: null
  property color foreground: Color.foreground
  property string fontFamily: Style.font.family

  signal moved(real value)
  signal released(real value)
  signal valueEntered(real value)
  signal animateClicked()
  signal inputFocusChanged(bool on)

  implicitHeight: Math.max(Style.space(28), slider.implicitHeight, valueField.implicitHeight)
  implicitWidth: Style.space(280)

  function parseInput(raw) {
    var s = String(raw || "").replace(/\s/g, "").replace(/°/g, "")
    s = s.replace(/π/g, "pi")
    if (s === "" || s === "-" || s === ".") return NaN
    if (s === "pi") return Math.PI
    if (s === "-pi") return -Math.PI
    var m = s.match(/^(-)?(\d*\.?\d*)pi(?:\/(\d*\.?\d+))?$/)
    if (m) {
      var num = m[2] === "" ? 1 : parseFloat(m[2])
      var den = m[3] ? parseFloat(m[3]) : 1
      if (!isFinite(num) || !isFinite(den) || den === 0) return NaN
      return (m[1] ? -1 : 1) * num * Math.PI / den
    }
    var n = Number(s)
    return n
  }

  function commitField() {
    var n = parseInput(valueField.text)
    if (!isFinite(n)) {
      valueField.text = root.valueText
      return
    }
    if (root.integer) n = Math.round(n)
    root.valueEntered(n)
    root.released(n)
  }

  onValueTextChanged: {
    if (!valueField.activeFocus) valueField.text = root.valueText
  }

  Text {
    id: nameLabel
    anchors.left: parent.left
    anchors.verticalCenter: parent.verticalCenter
    width: Style.space(28)
    text: root.label
    color: root.foreground
    font.family: root.fontFamily
    font.pixelSize: Style.font.body
    font.bold: true
    font.italic: true
    horizontalAlignment: Text.AlignLeft
  }

  Item {
    id: playBtn
    anchors.right: parent.right
    anchors.verticalCenter: parent.verticalCenter
    width: Style.space(26)
    height: Style.space(26)

    Text {
      anchors.centerIn: parent
      text: root.animating ? "󰏤" : "󰐊"
      color: root.animating ? Color.accent : Qt.darker(root.foreground, 1.7)
      font.family: root.fontFamily
      font.pixelSize: Style.font.body
    }

    MouseArea {
      anchors.fill: parent
      hoverEnabled: true
      cursorShape: Qt.PointingHandCursor
      onClicked: root.animateClicked()
    }
  }

  TextField {
    id: valueField
    anchors.right: playBtn.left
    anchors.rightMargin: Style.space(4)
    anchors.verticalCenter: parent.verticalCenter
    width: Style.space(72)
    verticalPadding: 2
    horizontalPadding: 6
    foreground: root.foreground
    font.family: root.fontFamily
    font.pixelSize: Style.font.caption
    text: root.valueText
    inputMethodHints: Qt.ImhFormattedNumbersOnly
    onActiveFocusChanged: {
      root.inputFocusChanged(activeFocus)
      if (activeFocus) selectAll()
      else root.commitField()
    }
    onAccepted: {
      root.commitField()
      keyCatcherHint()
    }
    Keys.onEscapePressed: function(event) {
      text = root.valueText
      focus = false
      event.accepted = true
    }

    function keyCatcherHint() {
      focus = false
    }
  }

  Item {
    id: trackBox
    anchors.left: nameLabel.right
    anchors.leftMargin: Style.space(10)
    anchors.right: valueField.left
    anchors.rightMargin: Style.space(8)
    anchors.verticalCenter: parent.verticalCenter
    height: slider.implicitHeight

    PanelSlider {
      id: slider
      anchors.left: parent.left
      anchors.verticalCenter: parent.verticalCenter
      width: parent.width
      bar: root.bar
      value: root.value
      minimum: root.minimum
      maximum: root.maximum
      step: root.step
      integer: root.integer
      fillColor: root.animating ? Color.accent : Qt.darker(root.foreground, 1.35)
      knobColor: root.foreground
      onMoved: function(v) { root.moved(v) }
      onReleased: function(v) { root.released(v) }
    }
  }

  Component.onCompleted: valueField.text = root.valueText
}
