import QtQuick
import qs.Commons
import qs.Ui

// One labeled slider row: name pill, track, live value.
Item {
  id: root

  property string label: ""
  property string valueText: ""
  property real value: 0
  property real minimum: -10
  property real maximum: 10
  property real step: 0.1
  property bool integer: false
  property var bar: null
  property color foreground: Color.foreground
  property string fontFamily: Style.font.family

  signal moved(real value)
  signal released(real value)

  implicitHeight: Math.max(Style.space(28), slider.implicitHeight)
  implicitWidth: Style.space(320)

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

  Text {
    id: valueLabel
    anchors.right: parent.right
    anchors.verticalCenter: parent.verticalCenter
    width: Style.space(78)
    text: root.valueText
    color: root.foreground
    font.family: root.fontFamily
    font.pixelSize: Style.font.body
    horizontalAlignment: Text.AlignRight
    elide: Text.ElideLeft
  }

  PanelSlider {
    id: slider
    anchors.left: nameLabel.right
    anchors.right: valueLabel.left
    anchors.leftMargin: Style.space(10)
    anchors.rightMargin: Style.space(10)
    anchors.verticalCenter: parent.verticalCenter
    bar: root.bar
    value: root.value
    minimum: root.minimum
    maximum: root.maximum
    step: root.step
    integer: root.integer
    fillColor: Color.accent
    knobColor: root.foreground
    onMoved: function(v) { root.moved(v) }
    onReleased: function(v) { root.released(v) }
  }
}
