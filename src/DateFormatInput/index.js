import React, { PropTypes } from 'react'
import { findDOMNode } from 'react-dom'
import Component from 'react-class'
import throttle from 'lodash.throttle'

import { getSelectionStart, getSelectionEnd, setCaretPosition } from '../TimeInput'

import toMoment from '../toMoment';

import parseFormat from './parseFormat'

const BACKWARDS = {
  Backspace: 1,
  ArrowUp: 1,
  ArrowDown: 1,
  PageUp: 1,
  PageDown: 1
}

export default class DateFormatInput extends Component {

  constructor(props) {
    super(props)

    const { positions, matches } = parseFormat(props.dateFormat)
    const defaultValue = props.defaultValue || Date.now()

    const delay = props.throttle || 100
    this.throttleSetValue = delay == -1 ? this.setValue : throttle(this.setValue, delay)

    const { minDate, maxDate } = this.getMinMax(props)

    this.state = {
      positions,
      matches,
      propsValue: props.value !== undefined,
      value: defaultValue,
      minDate,
      maxDate
    }
  }

  getMinMax(props) {
    props = props || this.props

    let minDate = null

    if (props.minDate) {
      minDate = this.toMoment(props.minDate, props)
    }

    let maxDate = null

    if (props.maxDate) {
      maxDate = this.toMoment(props.maxDate, props)
    }

    return {
      minDate, maxDate
    }
  }

  componentWillReceiveProps(nextProps) {
    const { minDate, maxDate } = this.getMinMax(nextProps)

    this.setState({
      minDate, maxDate
    })
  }

  componentDidUpdate() {
    if (this.props.value !== undefined && this.caretPos && this.isFocused()) {
      this.setCaretPosition(this.caretPos)
    }
  }

  toMoment(value, props) {
    props = props || this.props

    return toMoment(value, {
      locale: props.locale,
      dateFormat: props.dateFormat || this.props.dateFormat
    })
  }

  render() {
    const { props } = this

    const value = this.state.propsValue ?
                    props.value :
                    this.state.value

    const displayValue =
      this.displayValue =
        this.toMoment(value).format(props.dateFormat)

    return <input
      {...props}
      defaultValue={undefined}
      onFocus={this.onFocus}
      onBlur={this.onBlur}
      value={displayValue}
      onKeyDown={this.onKeyDown}
      onChange={this.onChange}
    />
  }

  focus(){
    findDOMNode(this).focus()
  }

  onFocus(event) {
    if (this.props.onFocus) {
      this.props.onFocus(event)
    }

    this.setState({
      focused: true
    })
  }

  onBlur(event) {
    if (this.props.onBlur) {
      this.props.onBlur(event)
    }

    this.setState({
      focused: false
    })
  }

  isFocused() {
    return this.state.focused
  }

  onChange(event) {
    event.stopPropagation()
  }

  onKeyDown(event) {
    const { props } = this

    const { key } = event

    if (props.stopPropagation) {
      event.stopPropagation()
    }

    const range = this.getSelectedRange()
    const selectedValue = this.getSelectedValue(range)
    const value = this.displayValue

    const { positions, matches } = this.state
    const valueStr = `${value}`

    let currentPosition = positions[range.start]

    if (typeof currentPosition == 'string') {
      currentPosition = positions[range.start + (key in BACKWARDS ? -1 : 1)]
    }

    if (!currentPosition) {
      currentPosition = positions[range.start - 1]
    }

    if (props.onKeyDown) {
      if (props.onKeyDown(event, currentPosition) === false) {
        this.caretPos = range
        return
      }
    }

    let keyName = key

    if (key == 'ArrowUp' || key == 'ArrowDown') {
      keyName = 'Arrow'
    }

    const handlerName = `handle${keyName}`

    let preventDefault
    let newValue
    let newCaretPos

    if (currentPosition && currentPosition[handlerName]) {
      const returnValue = currentPosition[handlerName](currentPosition, {
        range,
        selectedValue,
        value,
        positions,
        currentValue: valueStr.substring(currentPosition.start, currentPosition.end + 1),
        matches,
        event,
        key,
        input: this.getInput(),
        setCaretPosition: (...args) => this.setCaretPosition(...args)
      })

      this.caretPos = range

      if (returnValue && returnValue.value !== undefined) {
        newValue = valueStr.substring(0, currentPosition.start) +
                          returnValue.value +
                          valueStr.substring(currentPosition.end + 1)

        newCaretPos = returnValue.caretPos || range
        if (newCaretPos === true) {
          newCaretPos = { start: currentPosition.start, end: currentPosition.end + 1 }
        }
        preventDefault = returnValue.preventDefault !== false
      }
    }

    if (preventDefault || key == 'Backspace' || key == 'Delete' || key == ' ') {
      if (!preventDefault) {
        this.setCaretPosition(this.caretPos = {
          start: range.start + (key == 'Backspace' ? -1 : 1)
        })
      }
      preventDefault = true
    }

    const config = {
      currentPosition,
      preventDefault,
      event,
      value: newValue,
      stop: false
    }

    if (this.props.afterKeyDown) {
      this.props.afterKeyDown(config)
    }

    if (!config.stop && newCaretPos !== undefined) {
      const updateCaretPos = () => this.setCaretPosition(newCaretPos)
      this.caretPos = newCaretPos
      this.setStateValue(newValue, updateCaretPos, { key, oldValue: valueStr, currentPosition })
    }

    if (config.preventDefault) {
      event.preventDefault()
    }
  }

  getInput() {
    return findDOMNode(this)
  }

  setCaretPosition(pos) {
    const dom = this.getInput()
    if (dom) {
      setCaretPosition(dom, pos)
    }
  }

  format(mom, format) {
    return mom.format(format || this.props.format)
  }

  setStateValue(value, callback, { key, oldValue, currentPosition }) {
    let dateMoment = this.toMoment(value)

    if (!dateMoment.isValid()) {
      const dir = (key == 'ArrowUp' || key == 'PageUp') ? 1 : -1

      if (currentPosition.format == 'MM') {
        // updating the month
        dateMoment = this.toMoment(oldValue).add(dir, 'month')
      } else {
        // updating the day
        dateMoment = dir > 0 ?
          // we've gone with +1 beyond max, so reset to 1
          this.toMoment(oldValue).date(1) :

          // we've gone with -1 beyond max, so reset to max of month
          this.toMoment(oldValue).endOf('month')
      }

      if (!dateMoment.isValid()) {
        return;
      }

      value = this.format(dateMoment)
    }

    const { minDate, maxDate } = this.state

    if (minDate && dateMoment.isBefore(minDate)) {
      dateMoment = minDate
      value = this.format(dateMoment)
    }

    if (maxDate && dateMoment.isAfter(maxDate)) {
      dateMoment = maxDate
      value = this.format(dateMoment)
    }

    this.setState({
      value,
      propsValue: false
    }, typeof callback == 'function' && callback)

    // if (this.props.value !== undefined) {
    if (this.props.onChange) {
      this.throttleSetValue(value, dateMoment)
    }
  }

  setValue(value, dateMoment) {
    if (this.props.value === undefined) {
      this.setState({
        value,
        propsValue: false
      })
    } else {
      this.setState({
        propsValue: true,
        value: undefined
      })
    }

    if (this.props.onChange) {
      this.props.onChange(value, { dateMoment: dateMoment || this.toMoment(value) })
    }
  }

  getSelectedRange() {
    const dom = this.getInput()

    return {
      start: getSelectionStart(dom),
      end: getSelectionEnd(dom)
    }
  }

  getSelectedValue(range) {
    range = range || this.getSelectedRange()
    const value = this.displayValue

    return value.substring(range.start, range.end)
  }
}

DateFormatInput.defaultProps = {
  isDateInput: true,
  stopPropagation: true
}

DateFormatInput.propTypes = {
  dateFormat: PropTypes.string.isRequired,
  value: (props, propName) => {
    if (props[propName] !== undefined) {
      // console.warn('Due to performance considerations, TimeInput will only be uncontrolled.')
    }
  }
}
